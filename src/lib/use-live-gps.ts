'use client'
// Live GPS hook — real browser geolocation via navigator.geolocation.watchPosition.
// No simulated coordinates, no timers faking movement.
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiPost } from '@/lib/api-client'

export interface LivePosition {
  lat: number
  lng: number
  accuracy: number | null // meters
  speedKph: number | null
  heading: number | null // degrees
  timestamp: number
}

export type GpsStatus = 'IDLE' | 'REQUESTING' | 'LIVE' | 'WEAK' | 'UNAVAILABLE' | 'PERMISSION_DENIED'
export type SyncStatus = 'SYNCED' | 'OFFLINE' | 'SYNCING'

interface QueuedUpdate {
  resourceId: string
  incidentId: string | null
  latitude: number
  longitude: number
  accuracy: number | null
  speedKph: number | null
  heading: number | null
  timestamp: number
}

const WEAK_ACCURACY_M = 100
const MIN_SEND_INTERVAL_MS = 8000 // throttle server pushes
const MIN_MOVE_METERS = 5 // only push if moved meaningfully

export function useLiveGps(onPosition?: (p: LivePosition) => void) {
  const [status, setStatus] = useState<GpsStatus>('IDLE')
  const [position, setPosition] = useState<LivePosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('SYNCED')
  const watchId = useRef<number | null>(null)
  const onPositionRef = useRef(onPosition)
  useEffect(() => {
    onPositionRef.current = onPosition
  }, [onPosition])
  const lastSend = useRef<{ t: number; lat: number; lng: number } | null>(null)
  const queue = useRef<QueuedUpdate[]>([])
  const activeResource = useRef<{ resourceId: string; incidentId: string | null } | null>(null)

  const flushQueue = useCallback(async () => {
    if (queue.current.length === 0 || !activeResource.current) return
    const items = queue.current
    queue.current = []
    setSyncStatus('SYNCING')
    try {
      for (const item of items) {
        await apiPost('/api/resources/location', item)
      }
      setSyncStatus('SYNCED')
    } catch {
      // Re-queue on failure; do NOT report success while offline.
      queue.current = [...items, ...queue.current]
      setSyncStatus('OFFLINE')
    }
  }, [])

  const sendLocation = useCallback(
    async (p: LivePosition) => {
      const target = activeResource.current
      if (!target) return
      const payload: QueuedUpdate = {
        resourceId: target.resourceId,
        incidentId: target.incidentId,
        latitude: p.lat,
        longitude: p.lng,
        accuracy: p.accuracy,
        speedKph: p.speedKph,
        heading: p.heading,
        timestamp: p.timestamp,
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        queue.current.push(payload)
        setSyncStatus('OFFLINE')
        return
      }
      const now = Date.now()
      const last = lastSend.current
      if (last) {
        const moved = Math.hypot((p.lat - last.lat) * 111000, (p.lng - last.lng) * 111000 * Math.cos((p.lat * Math.PI) / 180))
        if (now - last.t < MIN_SEND_INTERVAL_MS && moved < MIN_MOVE_METERS) return
      }
      lastSend.current = { t: now, lat: p.lat, lng: p.lng }
      setSyncStatus('SYNCING')
      try {
        await apiPost('/api/resources/location', payload)
        setSyncStatus('SYNCED')
        await flushQueue()
      } catch {
        queue.current.push(payload)
        setSyncStatus('OFFLINE')
      }
    },
    [flushQueue]
  )

  const handlePosition = useCallback(
    (pos: GeolocationPosition) => {
      const p: LivePosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        speedKph: pos.coords.speed != null ? Math.max(0, pos.coords.speed * 3.6) : null,
        heading: pos.coords.heading != null ? pos.coords.heading : null,
        timestamp: pos.timestamp,
      }
      setPosition(p)
      setStatus(p.accuracy != null && p.accuracy > WEAK_ACCURACY_M ? 'WEAK' : 'LIVE')
      setError(null)
      onPositionRef.current?.(p)
      void sendLocation(p)
    },
    [sendLocation]
  )

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      setStatus('PERMISSION_DENIED')
      setError('Location permission is required for Go Live navigation.')
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      setStatus('UNAVAILABLE')
      setError('Location is currently unavailable. Check that GPS/location services are on.')
    } else if (err.code === err.TIMEOUT) {
      setStatus('WEAK')
      setError('GPS signal timed out. Move to an open area and try again.')
    } else {
      setStatus('UNAVAILABLE')
      setError('GPS error. Try again.')
    }
  }, [])

  const start = useCallback(
    (opts?: { resourceId: string; incidentId: string | null }) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setStatus('UNAVAILABLE')
        setError('Geolocation is not supported by this browser.')
        return
      }
      // When no resource target is given (e.g. citizen GO LIVE), GPS is used
      // locally in the browser only — nothing is posted to the server.
      activeResource.current = opts ? { resourceId: opts.resourceId, incidentId: opts.incidentId } : null
      setStatus('REQUESTING')
      setError(null)
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000,
      })
    },
    [handlePosition, handleError]
  )

  const stop = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    activeResource.current = null
    queue.current = []
    lastSend.current = null
    setStatus('IDLE')
    setPosition(null)
    setError(null)
    setSyncStatus('SYNCED')
  }, [])

  const retryPermission = useCallback(() => {
    const target = activeResource.current
    if (target) start(target)
  }, [start])

  // Keep GPS tracking locally even when network drops; flush when back online.
  useEffect(() => {
    const online = () => {
      setSyncStatus('SYNCING')
      void flushQueue().then(() => {
        if (queue.current.length === 0) setSyncStatus('SYNCED')
      })
    }
    const offline = () => setSyncStatus('OFFLINE')
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [flushQueue])

  useEffect(
    () => () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    },
    []
  )

  return { status, position, error, syncStatus, start, stop, retryPermission }
}
