'use client'

import { useEffect, useState, useCallback, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import type { DashboardEvent } from '@/lib/types'

// Singleton WebSocket connection to the realtime hub (port 3003 via Caddy).
// Auto-reconnects. Never throws — used for live dashboard updates.

let socket: Socket | null = null
const listeners = new Set<(e: DashboardEvent) => void>()

function ensureSocket() {
  if (socket) return socket
  socket = io('/?XTransformPort=3003', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  })
  socket.on('dashboard-event', (event: DashboardEvent) => {
    listeners.forEach((l) => {
      try {
        l(event)
      } catch {
        /* ignore listener errors */
      }
    })
  })
  socket.on('connect', () => console.log('[ws] connected to realtime hub'))
  socket.on('disconnect', (reason) => console.warn('[ws] disconnected:', reason))
  socket.on('reconnect', (attempt) => console.log(`[ws] reconnected after ${attempt} attempts`))
  return socket
}

export function useRealtimeEvents(onEvent?: (e: DashboardEvent) => void) {
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<DashboardEvent[]>([])

  useEffect(() => {
    const s = ensureSocket()
    const updateConnected = () => setConnected(s.connected)
    updateConnected()
    s.on('connect', updateConnected)
    s.on('disconnect', updateConnected)

    const handler = (e: DashboardEvent) => {
      setEvents((prev) => [...prev.slice(-199), e])
      onEvent?.(e)
    }
    listeners.add(handler)

    return () => {
      s.off('connect', updateConnected)
      s.off('disconnect', updateConnected)
      listeners.delete(handler)
    }
  }, [onEvent])

  const clearEvents = useCallback(() => setEvents([]), [])
  return { connected, events, clearEvents }
}

export function useRealtimeConnection() {
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    const s = ensureSocket()
    const update = () => setConnected(s.connected)
    update()
    s.on('connect', update)
    s.on('disconnect', update)
    return () => {
      s.off('connect', update)
      s.off('disconnect', update)
    }
  }, [])
  return connected
}

// Convenience: subscribe to events of a specific type
export function useRealtimeSubscription(
  type: string,
  onEvent: (e: DashboardEvent) => void
) {
  useEffect(() => {
    const handler = (e: DashboardEvent) => {
      if (e.type === type || e.type.startsWith(type)) onEvent(e)
    }
    listeners.add(handler)
    ensureSocket()
    return () => {
      listeners.delete(handler)
    }
  }, [type, onEvent])
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    ensureSocket()
  }, [])
  return <>{children}</>
}
