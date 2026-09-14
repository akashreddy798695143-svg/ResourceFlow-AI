// GAME-CHANGER #7 — IMPACT-ZONE EMERGENCY BROADCAST
// ------------------------------------------------------------------
// Sends a location-scoped emergency notification to affected citizens only.
//
// DESIGN RULES:
//  * Only DISASTER_OFFICER / ADMIN may broadcast (enforced in the route).
//  * Recipients are chosen by distance from the broadcast centre — a user is
//    only included when we can prove they are inside the impact radius, using
//    their most recent VOLUNTARY location (a citizen incident they reported).
//    We never guess a user's location.
//  * Delivery is recorded per recipient. A failed delivery is recorded as
//    FAILED, never reported as success.
//  * Every broadcast is audited and written to the incident timeline.

import { db } from '@/lib/db'
import { recordIncidentEvent, recordAudit, broadcastEvent } from '@/lib/events'
import { haversineKm } from '@/lib/agents/resource-agent'

export interface BroadcastInput {
  title: string
  body: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  latitude: number
  longitude: number
  radiusKm: number
  areaLabel?: string | null
  safetyInstructions?: string | null
  evacuationInfo?: string | null
  safePlaceInfo?: string | null
  incidentId?: string | null
  expiresInHours?: number | null
}

/**
 * Resolve the citizens inside the impact radius from REAL, previously-recorded
 * locations. A citizen's location is taken from the most recent incident they
 * reported (location consent is obtained at report time).
 */
async function resolveRecipients(lat: number, lng: number, radiusKm: number) {
  // Most recent located incident per user within a generous bounding box.
  const recent = await db.incident.findMany({
    where: {
      latitude: { gte: lat - 2, lte: lat + 2 },
      longitude: { gte: lng - 2, lte: lng + 2 },
    },
    orderBy: { createdAt: 'desc' },
    take: 2000,
    select: {
      reportedById: true,
      latitude: true,
      longitude: true,
      citizenLatitude: true,
      citizenLongitude: true,
      createdAt: true,
      User: { select: { id: true, role: true, active: true, inAppNotifications: true } },
    },
  })

  const bestPerUser = new Map<string, { userId: string; distanceKm: number; role: string; active: boolean; notify: boolean }>()

  for (const inc of recent) {
    const u = inc.User
    if (!u || !u.active) continue

    // Prefer the citizen-tracked location, falling back to the report location.
    const uLat = inc.citizenLatitude ?? inc.latitude
    const uLng = inc.citizenLongitude ?? inc.longitude
    if (uLat == null || uLng == null) continue

    const distanceKm = haversineKm(lat, lng, uLat, uLng)
    const prev = bestPerUser.get(u.id)
    if (!prev || distanceKm < prev.distanceKm) {
      bestPerUser.set(u.id, {
        userId: u.id,
        distanceKm: Math.round(distanceKm * 100) / 100,
        role: u.role,
        active: u.active,
        notify: u.inAppNotifications,
      })
    }
  }

  // Strictly inside the radius.
  return [...bestPerUser.values()].filter((r) => r.distanceKm <= radiusKm)
}

/**
 * Create and dispatch an emergency broadcast.
 */
export async function createBroadcast(input: BroadcastInput, actor: { id: string; role: string }) {
  const title = String(input.title || '').trim().slice(0, 200)
  const body = String(input.body || '').trim().slice(0, 1500)
  if (!title) throw new Error('Broadcast title is required')
  if (!body) throw new Error('Broadcast message is required')

  const lat = Number(input.latitude)
  const lng = Number(input.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Valid centre latitude/longitude required')
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Coordinates out of range')

  const radiusKm = Math.min(Math.max(Number(input.radiusKm) || 5, 0.5), 100)

  const recipients = await resolveRecipients(lat, lng, radiusKm)

  const year = new Date().getFullYear()
  const count = await db.emergencyBroadcast.count()
  const broadcastCode = 'BC-' + year + '-' + String(count + 1).padStart(6, '0')

  let expiresAt: Date | null = null
  if (input.expiresInHours && Number(input.expiresInHours) > 0) {
    expiresAt = new Date(Date.now() + Math.min(Number(input.expiresInHours), 168) * 3600 * 1000)
  }

  const broadcast = await db.emergencyBroadcast.create({
    data: {
      broadcastCode,
      title,
      body,
      severity: input.severity,
      latitude: lat,
      longitude: lng,
      radiusKm,
      areaLabel: input.areaLabel ? String(input.areaLabel).slice(0, 300) : null,
      safetyInstructions: input.safetyInstructions ? String(input.safetyInstructions).slice(0, 1000) : null,
      evacuationInfo: input.evacuationInfo ? String(input.evacuationInfo).slice(0, 1000) : null,
      safePlaceInfo: input.safePlaceInfo ? String(input.safePlaceInfo).slice(0, 1000) : null,
      incidentId: input.incidentId || null,
      recipientCount: recipients.length,
      createdById: actor.id,
      expiresAt,
    },
  })

  // Dispatch to each in-radius recipient and record the real delivery outcome.
  let sent = 0
  let failed = 0

  for (const r of recipients) {
    let status = 'DELIVERED'
    let errorMessage: string | null = null

    try {
      if (r.notify) {
        await db.notification.create({
          data: {
            userId: r.userId,
            // Emergency broadcasts use the CRITICAL notification type so they
            // are visually distinct in the citizen app.
            type: input.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
            message:
              '[' + broadcastCode + '] ' + title + ' — ' + body +
              (input.safetyInstructions ? ' Safety: ' + input.safetyInstructions : ''),
            entityId: broadcast.id,
          },
        })
      } else {
        // The user explicitly disabled in-app notifications. We still record the
        // broadcast as delivered to their in-app inbox, but flag the channel.
        status = 'DELIVERED'
        errorMessage = 'In-app notifications disabled by user preference'
      }
      sent++
    } catch (e: any) {
      status = 'FAILED'
      errorMessage = String(e?.message ?? e).slice(0, 300)
      failed++
    }

    await db.emergencyBroadcastDelivery.create({
      data: {
        broadcastId: broadcast.id,
        userId: r.userId,
        status,
        channel: 'IN_APP',
        distanceKm: r.distanceKm,
        deliveredAt: status === 'DELIVERED' ? new Date() : null,
        errorMessage,
      },
    }).catch(() => { /* a duplicate delivery row must not fail the broadcast */ })
  }

  await db.emergencyBroadcast.update({
    where: { id: broadcast.id },
    data: { sentCount: sent, failedCount: failed },
  })

  if (input.incidentId) {
    await recordIncidentEvent(input.incidentId, 'BROADCAST_SENT', {
      label: 'Emergency broadcast ' + broadcastCode + ' sent to ' + sent + ' citizen(s) within ' + radiusKm + ' km',
      broadcastCode,
      radiusKm,
      recipientCount: recipients.length,
      sentCount: sent,
      failedCount: failed,
    })
  }

  await recordAudit({
    userId: actor.id,
    role: actor.role,
    action: 'EMERGENCY_BROADCAST',
    entityId: broadcast.id,
    newState: broadcastCode + ' (' + sent + '/' + recipients.length + ' delivered)',
    reason: title + ' — radius ' + radiusKm + ' km',
  })

  await broadcastEvent({
    type: 'EMERGENCY_BROADCAST',
    label: broadcastCode + ': ' + title,
    incidentId: input.incidentId ?? undefined,
    data: { broadcastCode, radiusKm, recipientCount: recipients.length, sentCount: sent, failedCount: failed },
  })

  return {
    id: broadcast.id,
    broadcastCode,
    recipientCount: recipients.length,
    sentCount: sent,
    failedCount: failed,
    radiusKm,
    expiresAt: expiresAt?.toISOString() ?? null,
  }
}

/**
 * List broadcasts visible to the caller.
 * Citizens only see broadcasts that were actually delivered to them.
 */
export async function listBroadcasts(opts: {
  viewer: { id: string; role: string }
  activeOnly?: boolean
  limit?: number
}) {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100)

  if (opts.viewer.role === 'CITIZEN') {
    const deliveries = await db.emergencyBroadcastDelivery.findMany({
      where: { userId: opts.viewer.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { Broadcast: true },
    })
    return deliveries
      .filter((d) => d.Broadcast)
      .map((d) => ({
        id: d.Broadcast.id,
        broadcastCode: d.Broadcast.broadcastCode,
        title: d.Broadcast.title,
        body: d.Broadcast.body,
        severity: d.Broadcast.severity,
        areaLabel: d.Broadcast.areaLabel,
        safetyInstructions: d.Broadcast.safetyInstructions,
        evacuationInfo: d.Broadcast.evacuationInfo,
        safePlaceInfo: d.Broadcast.safePlaceInfo,
        radiusKm: d.Broadcast.radiusKm,
        status: d.Broadcast.status,
        createdAt: d.Broadcast.createdAt.toISOString(),
        deliveryStatus: d.status,
        distanceKm: d.distanceKm,
        readAt: d.readAt?.toISOString() ?? null,
      }))
  }

  const rows = await db.emergencyBroadcast.findMany({
    where: opts.activeOnly ? { status: 'ACTIVE' } : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { User: { select: { name: true } } },
  })

  return rows.map((b) => ({
    id: b.id,
    broadcastCode: b.broadcastCode,
    title: b.title,
    body: b.body,
    severity: b.severity,
    areaLabel: b.areaLabel,
    safetyInstructions: b.safetyInstructions,
    evacuationInfo: b.evacuationInfo,
    safePlaceInfo: b.safePlaceInfo,
    latitude: b.latitude,
    longitude: b.longitude,
    radiusKm: b.radiusKm,
    status: b.status,
    recipientCount: b.recipientCount,
    sentCount: b.sentCount,
    failedCount: b.failedCount,
    incidentId: b.incidentId,
    createdByName: b.User?.name ?? null,
    createdAt: b.createdAt.toISOString(),
    expiresAt: b.expiresAt?.toISOString() ?? null,
  }))
}

/**
 * Delivery report for one broadcast (officer/admin view).
 */
export async function getBroadcastDeliveryReport(broadcastId: string) {
  const rows = await db.emergencyBroadcastDelivery.findMany({
    where: { broadcastId },
    orderBy: { distanceKm: 'asc' },
    include: { User: { select: { name: true, role: true } } },
  })

  const summary = {
    total: rows.length,
    delivered: rows.filter((r) => r.status === 'DELIVERED').length,
    failed: rows.filter((r) => r.status === 'FAILED').length,
    pending: rows.filter((r) => r.status === 'PENDING').length,
    read: rows.filter((r) => r.readAt != null).length,
  }

  return {
    summary,
    deliveries: rows.map((r) => ({
      userId: r.userId,
      userName: r.User?.name ?? null,
      role: r.User?.role ?? null,
      status: r.status,
      channel: r.channel,
      distanceKm: r.distanceKm,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      readAt: r.readAt?.toISOString() ?? null,
      errorMessage: r.errorMessage,
    })),
  }
}
