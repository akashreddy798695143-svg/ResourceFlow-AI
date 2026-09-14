// GAME-CHANGER #6 — COMMUNICATION FALLBACK / HEALTH
// ------------------------------------------------------------------
// Reports the HONEST communication state of the platform: LIVE, DELAYED or
// OFFLINE, plus the age of the last successful update.
//
// The whole point of this feature is to never claim real-time connectivity we
// do not have. If we cannot verify a channel we report it as unavailable rather
// than assuming it works.
//
// Design: the realtime hub is a separate process (mini-services/realtime on
// :3003). We probe it over HTTP because that is the same path the WebSocket
// upgrade uses, so a reachable probe is real evidence the hub is up.

import { db } from '@/lib/db'

const HUB_BASE = process.env.REALTIME_HUB_URL || 'http://localhost:3003'

export interface CommsHealth {
  state: 'LIVE' | 'DELAYED' | 'OFFLINE'
  internetOnline: boolean
  websocketConnected: boolean
  gpsAvailable: boolean | null
  apiReachable: boolean
  hubReachable: boolean
  latencyMs: number | null
  lastSuccessfulUpdate: string | null
  secondsSinceLastUpdate: number | null
  notificationDelivery: 'OK' | 'DEGRADED' | 'FAILED' | 'UNKNOWN'
  details: {
    hubUrl: string
    checkedAt: string
    notes: string[]
  }
}

/**
 * Probe the realtime hub. A short timeout keeps this cheap enough to call on
 * every dashboard poll.
 */
async function probeHub(): Promise<{ reachable: boolean; latencyMs: number | null }> {
  const started = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    // Any HTTP answer (even 404) proves the hub process is listening.
    const res = await fetch(HUB_BASE + '/health', { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timer)
    return { reachable: res.ok || res.status < 500, latencyMs: Date.now() - started }
  } catch {
    return { reachable: false, latencyMs: null }
  }
}

/**
 * Compute communication health.
 * @param opts.incidentId optional — scopes "last successful update" to one incident
 */

// Honest, human-readable connection notes.
const REALTIME_HUB_DOWN =
  'Realtime hub is not reachable - the client will fall back to REST polling.'
const REALTIME_HUB_UP =
  'Realtime hub reachable (WebSocket transport available).'

export async function getCommsHealth(opts: { incidentId?: string; persist?: boolean } = {}): Promise<CommsHealth> {
  const notes: string[] = []
  const checkedAt = new Date()

  const hub = await probeHub()
  if (!hub.reachable) {
    notes.push(REALTIME_HUB_DOWN)
  } else {
    notes.push(REALTIME_HUB_UP)
  }

  // The most recent timeline event is our evidence of a "successful update".
  const recentEvent = await db.incidentEvent.findFirst({
    where: opts.incidentId ? { incidentId: opts.incidentId } : {},
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  const lastSuccessfulUpdate = recentEvent?.createdAt ?? null
  const secondsSinceLastUpdate = lastSuccessfulUpdate
    ? Math.round((checkedAt.getTime() - lastSuccessfulUpdate.getTime()) / 1000)
    : null

  // Notification delivery health from the delivery log (real rows only).
  let notificationDelivery: CommsHealth['notificationDelivery'] = 'UNKNOWN'
  try {
    const [sent, failed] = await Promise.all([
      db.notificationLog.count({
        where: { status: { in: ['SENT', 'DELIVERED'] }, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      }),
      db.notificationLog.count({
        where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      }),
    ])
    if (sent + failed === 0) notificationDelivery = 'UNKNOWN'
    else if (failed === 0) notificationDelivery = 'OK'
    else if (failed / (sent + failed) < 0.25) notificationDelivery = 'DEGRADED'
    else notificationDelivery = 'FAILED'
    if (notificationDelivery === 'DEGRADED') notes.push(Math.round((failed / (sent + failed)) * 100) + '% of notifications failed in the last 24h.')
    if (notificationDelivery === 'FAILED') notes.push('Most notifications failed in the last 24h — delivery channel may be down.')
  } catch {
    notificationDelivery = 'UNKNOWN'
  }

  // GPS availability is a client-side capability. The server cannot know whether
  // a given browser granted permission, so we report null (unknown) rather than
  // asserting true — the UI merges its own navigator.geolocation result.
  const gpsAvailable: boolean | null = null

  // Derive the state honestly:
  //  - OFFLINE  : the hub is down AND we have no recent update at all (or very stale)
  //  - DELAYED  : live transport is unavailable, or updates are stale
  //  - LIVE     : hub reachable AND a recent update exists
  const STALE_SECONDS = 120
  let state: CommsHealth['state']
  if (!hub.reachable && (secondsSinceLastUpdate == null || secondsSinceLastUpdate > 900)) {
    state = 'OFFLINE'
  } else if (!hub.reachable || secondsSinceLastUpdate == null || secondsSinceLastUpdate > STALE_SECONDS) {
    state = 'DELAYED'
  } else {
    state = 'LIVE'
  }

  const health: CommsHealth = {
    state,
    internetOnline: true, // if this code ran server-side, the server is online; the client refines this
    websocketConnected: hub.reachable,
    gpsAvailable,
    apiReachable: true,
    hubReachable: hub.reachable,
    latencyMs: hub.latencyMs,
    lastSuccessfulUpdate: lastSuccessfulUpdate?.toISOString() ?? null,
    secondsSinceLastUpdate,
    notificationDelivery,
    details: {
      hubUrl: HUB_BASE,
      checkedAt: checkedAt.toISOString(),
      notes,
    },
  }

  if (opts.persist) {
    try {
      await db.communicationStatus.create({
        data: {
          scope: opts.incidentId ? 'INCIDENT' : 'GLOBAL',
          scopeId: opts.incidentId ?? null,
          state: health.state,
          internetOnline: health.internetOnline,
          websocketConnected: health.websocketConnected,
          gpsAvailable: false,
          apiReachable: health.apiReachable,
          lastSuccessfulUpdate,
          notificationDelivery: health.notificationDelivery,
          latencyMs: health.latencyMs,
          details: { notes, hubUrl: HUB_BASE } as any,
        },
      })
    } catch (e) {
      console.error('[comms-health] failed to persist sample:', e)
    }
  }

  return health
}

/**
 * Human-readable "last update" phrase. Used by the UI so the wording is
 * consistent everywhere and never overstates freshness.
 */
export function formatLastUpdate(seconds: number | null): string {
  if (seconds == null) return 'No updates recorded yet'
  if (seconds < 10) return 'Last update: just now'
  if (seconds < 60) return 'Last update: ' + seconds + ' seconds ago'
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return 'Last update: ' + mins + ' minute' + (mins === 1 ? '' : 's') + ' ago'
  const hours = Math.floor(mins / 60)
  if (hours < 24) return 'Last update: ' + hours + ' hour' + (hours === 1 ? '' : 's') + ' ago'
  const days = Math.floor(hours / 24)
  return 'Last update: ' + days + ' day' + (days === 1 ? '' : 's') + ' ago'
}
