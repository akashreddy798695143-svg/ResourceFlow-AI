'use client'

// useVolunteerLocation — live GPS tracking for registered volunteers using the
// browser Geolocation API (watchPosition/clearWatch). Tracks whenever the
// volunteer has an existing registration (any status — location sharing is
// independent of the verification workflow) AND locationSharing is enabled.
// watchPosition() triggers the browser location permission prompt.

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiPost } from '@/lib/api-client'

const MIN_DISTANCE_METERS = 20 // Don't spam the server for tiny GPS fluctuations

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lat1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) ** 2 * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface LocationQueueItem {
  latitude: number
  longitude: number
  accuracy: number | null
  timestamp: number
}

export function useVolunteerLocation(enabled: boolean, hasRegistration: boolean, locationSharing: boolean) {
  const [tracking, setTracking] = useState(false)
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastSent, setLastSent] = useState<Date | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [queuedCount, setQueuedCount] = useState(0)
  const watchIdRef = useRef<number | null>(null)
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null)
  const queueRef = useRef<LocationQueueItem[]>([])
  const sendingRef = useRef(false)

  const shouldTrack = enabled && hasRegistration && locationSharing

  const sendLocation = useCallback(async (lat: number, lng: number, accuracy: number | null) => {
    if (sendingRef.current) return
    sendingRef.current = true
    try {
      await apiPost('/api/volunteer/location', { latitude: lat, longitude: lng, accuracy })
      setLastSent(new Date())
      setLastLocation({ lat, lng })
      lastLocationRef.current = { lat, lng }
      setError(null)
    } catch (e: any) {
      // Network failure — queue the latest location and retry later
      queueRef.current.push({ latitude: lat, longitude: lng, accuracy, timestamp: Date.now() })
      if (queueRef.current.length > 10) queueRef.current.shift()
      setQueuedCount(queueRef.current.length)
      setError(e.message || 'Failed to send location — will retry when back online')
    } finally {
      sendingRef.current = false
    }
  }, [])

  const flushQueue = useCallback(async () => {
    if (queueRef.current.length === 0 || sendingRef.current) return
    sendingRef.current = true
    try {
      const item = queueRef.current[0]
      await apiPost('/api/volunteer/location', { latitude: item.latitude, longitude: item.longitude, accuracy: item.accuracy })
      queueRef.current.shift()
      setQueuedCount(queueRef.current.length)
      setLastSent(new Date())
      setLastLocation({ lat: item.latitude, lng: item.longitude })
      lastLocationRef.current = { lat: item.latitude, lng: item.longitude }
      setError(null)
    } catch {
      // Keep queued; retried on next watch update / online event
    } finally {
      sendingRef.current = false
    }
  }, [])

  const startTracking = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation is not available on this device/browser')
      return
    }
    if (watchIdRef.current !== null) return // already watching
    setError(null)
    setPermissionDenied(false)
    setTracking(true)

    // watchPosition triggers the browser location permission prompt
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        const lastLoc = lastLocationRef.current
        // First fix is always sent; afterwards only meaningful movement
        if (!lastLoc || haversineMeters(lastLoc.lat, lastLoc.lng, latitude, longitude) >= MIN_DISTANCE_METERS) {
          sendLocation(latitude, longitude, accuracy ?? null)
        }
        // Try to flush any queued updates whenever we get a fresh fix
        flushQueue()
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionDenied(true)
          setError('Location permission denied. Enable location access in your browser to share your position.')
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError('Location unavailable. Device could not determine position — last known location kept.')
        } else if (err.code === err.TIMEOUT) {
          setError('Location request timed out. Retrying automatically…')
        } else {
          setError('Location error')
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    )
  }, [sendLocation, flushQueue])

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setTracking(false)
  }, [])

  // Start/stop tracking (watchPosition/clearWatch) based on shouldTrack
  useEffect(() => {
    if (shouldTrack) {
      startTracking()
    } else {
      stopTracking()
    }
    return () => { stopTracking() }
  }, [shouldTrack, startTracking, stopTracking])

  // Flush queued updates when connectivity returns
  useEffect(() => {
    const handleOnline = () => { if (shouldTrack) flushQueue() }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [shouldTrack, flushQueue])

  return {
    tracking,
    lastLocation,
    lastSent,
    error,
    permissionDenied,
    queuedCount,
    startTracking,
    stopTracking,
  }
}
