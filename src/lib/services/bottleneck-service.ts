// GAME-CHANGER #9 — RESPONSE BOTTLENECK DETECTOR
// ------------------------------------------------------------------
// Continuously analyses active incidents for operational problems and records
// them as ResponseBottleneck rows with an AI-recommended action.
//
// DESIGN RULES:
//  * Every detection is based on REAL stored data (timeline events, assignments,
//    responder GPS history, risk changes). Nothing is simulated.
//  * AI never executes a fix. It writes a recommendation; an officer approves.
//  * Detections are de-duplicated: re-running the sweep will not spam duplicate
//    OPEN rows for the same (incident, kind, resource) problem.
//  * If live GPS is stale we say "location unavailable" rather than pretending
//    the responder is moving or stationary.

import { db } from '@/lib/db'
import { askAI, extractJson } from '@/lib/ai-client'
import { recordIncidentEvent, recordAudit } from '@/lib/events'
import { haversineKm } from '@/lib/agents/resource-agent'

export type BottleneckKind =
  | 'RESPONDER_STALLED'
  | 'GPS_UNAVAILABLE'
  | 'ROAD_BLOCKED'
  | 'RESOURCE_DELAYED'
  | 'NO_RESOURCE_ASSIGNED'
  | 'AMBULANCE_UNAVAILABLE'
  | 'COMMS_LOST'
  | 'RESOURCE_CONTENTION'
  | 'ETA_INCREASING'
  | 'SITUATION_WORSENING'

export interface DetectedBottleneck {
  incidentId: string
  resourceId?: string | null
  kind: BottleneckKind
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  title: string
  detail: string
  recommendedAction: string
  detectedBy: 'ai' | 'system'
}

// Thresholds — tuned to be conservative so we only surface real problems.
const STALL_MINUTES = 8          // no position change while EN_ROUTE
const GPS_STALE_MINUTES = 10     // no GPS update at all
const ACK_DELAY_MINUTES = 5
const ARRIVE_DELAY_MINUTES = 25
const RESOLVE_DELAY_MINUTES = 90
const ETA_WORSEN_FACTOR = 1.5
const ETA_WORSEN_MIN_DELTA = 8   // minutes

function minutesSince(d: Date | null | undefined): number | null {
  if (!d) return null
  return (Date.now() - d.getTime()) / 60000
}

/**
 * Run detection for one incident. Returns the bottlenecks found (not yet persisted).
 */
export async function detectIncidentBottlenecks(incidentId: string): Promise<DetectedBottleneck[]> {
  const found: DetectedBottleneck[] = []

  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: {
      ResourceAssignment: {
        where: { status: 'ASSIGNED' },
        include: { Resource: true },
      },
    },
  })
  if (!incident) return found
  if (['RESOLVED', 'CLOSED'].includes(incident.status)) return found

  const assignment = incident.ResourceAssignment[0]
  const now = Date.now()

  // ─── 1. No resource assigned (and the incident is not brand new) ────────
  const ageMin = minutesSince(incident.createdAt) ?? 0
  if (!assignment && !['RESOLVED', 'CLOSED'].includes(incident.status) && ageMin > 10) {
    found.push({
      incidentId,
      kind: 'NO_RESOURCE_ASSIGNED',
      severity: incident.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      title: 'No resource assigned',
      detail: 'Incident ' + incident.incidentCode + ' has been open for ' + Math.round(ageMin) + ' minutes with no assigned resource.',
      recommendedAction: 'Recommend a resource now, or escalate if none is available.',
      detectedBy: 'system',
    })
  }

  if (assignment) {
    const resource = assignment.Resource

    // ─── 2. Ambulance unavailable but a medical incident needs one ────────
    if (incident.type === 'MEDICAL' && resource.status === 'UNAVAILABLE') {
      found.push({
        incidentId,
        resourceId: resource.id,
        kind: 'AMBULANCE_UNAVAILABLE',
        severity: 'CRITICAL',
        title: 'Assigned medical resource unavailable',
        detail: resource.resourceCode + ' is marked UNAVAILABLE while assigned to a medical emergency.',
        recommendedAction: 'Reassign to the nearest available ambulance immediately.',
        detectedBy: 'system',
      })
    }

    // ─── 3. Resource delayed ──────────────────────────────
    const ackDelay = minutesSince(incident.assignedAt)
    if (ackDelay != null && ackDelay > ACK_DELAY_MINUTES && !incident.acknowledgedAt) {
      found.push({
        incidentId,
        resourceId: resource.id,
        kind: 'RESOURCE_DELAYED',
        severity: 'HIGH',
        title: 'Responder has not acknowledged',
        detail: resource.resourceCode + ' was assigned ' + Math.round(ackDelay) + ' minutes ago and has not acknowledged.',
        recommendedAction: 'Contact the responder, or reassign to the next available unit.',
        detectedBy: 'system',
      })
    }

    const enRouteDelay = minutesSince(incident.startedAt)
    if (enRouteDelay != null && enRouteDelay > ARRIVE_DELAY_MINUTES && !incident.arrivedAt) {
      found.push({
        incidentId,
        resourceId: resource.id,
        kind: 'ETA_INCREASING',
        severity: 'HIGH',
        title: 'Response exceeding expected travel time',
        detail: resource.resourceCode + ' has been en route for ' + Math.round(enRouteDelay) + ' minutes without arrival confirmation.',
        recommendedAction: 'Verify route status and consider an alternate approach or unit.',
        detectedBy: 'system',
      })
    }

    const resolveDelay = minutesSince(incident.arrivedAt)
    if (resolveDelay != null && resolveDelay > RESOLVE_DELAY_MINUTES && !incident.resolvedAt) {
      found.push({
        incidentId,
        resourceId: resource.id,
        kind: 'SITUATION_WORSENING',
        severity: 'MEDIUM',
        title: 'On-scene work extending beyond threshold',
        detail: 'Responder has been on scene for ' + Math.round(resolveDelay) + ' minutes without resolution.',
        recommendedAction: 'Confirm the situation and send additional capability if required.',
        detectedBy: 'system',
      })
    }

    // ─── 4. Responder stalled / GPS unavailable (real telemetry only) ─────
    const updates = await db.responderLocationUpdate.findMany({
      where: { resourceId: resource.id },
      orderBy: { timestamp: 'desc' },
      take: 12,
    })

    const last = updates[0]
    const isMovingStage = resource.status === 'EN_ROUTE' && !incident.arrivedAt

    if (isMovingStage && !last) {
      found.push({
        incidentId,
        resourceId: resource.id,
        kind: 'GPS_UNAVAILABLE',
        severity: 'MEDIUM',
        title: 'No live responder location',
        detail: resource.resourceCode + ' is en route but has not shared any GPS position. Live location is unavailable.',
        recommendedAction: 'Request the responder to start Go Live navigation, or confirm progress by radio.',
        detectedBy: 'system',
      })
    } else if (isMovingStage && last) {
      const staleMin = minutesSince(last.timestamp) ?? 0
      if (staleMin > GPS_STALE_MINUTES) {
        found.push({
          incidentId,
          resourceId: resource.id,
          kind: 'GPS_UNAVAILABLE',
          severity: 'MEDIUM',
          title: 'Live location stale',
          detail: 'Last authorized position from ' + resource.resourceCode + ' was ' + Math.round(staleMin) + ' minutes ago. Showing last known location.',
          recommendedAction: 'Re-confirm responder connectivity and progress.',
          detectedBy: 'system',
        })
      } else if (updates.length >= 3) {
        // Compare the newest position with the oldest in the window.
        const oldest = updates[updates.length - 1]
        const movedKm = haversineKm(
          oldest.latitude, oldest.longitude, last.latitude, last.longitude
        )
        const windowMin = (last.timestamp.getTime() - oldest.timestamp.getTime()) / 60000
        if (windowMin >= STALL_MINUTES && movedKm < 0.15) {
          found.push({
            incidentId,
            resourceId: resource.id,
            kind: 'RESPONDER_STALLED',
            severity: 'HIGH',
            title: 'Responder not moving',
            detail: resource.resourceCode + ' moved less than 150 m over ' + Math.round(windowMin) + ' minutes while en route.',
            recommendedAction: 'Check for a blockage or breakdown and reassign if needed.',
            detectedBy: 'system',
          })
        }
      }
    }
  }

  // ─── 5. Road blocked on the incident ────────────────────
  if (incident.aiRoadBlocked === true) {
    found.push({
      incidentId,
      kind: 'ROAD_BLOCKED',
      severity: 'HIGH',
      title: 'Access route reported blocked',
      detail: 'Road blockage was reported for ' + incident.incidentCode + ' at ' + incident.location + '.',
      recommendedAction: 'Assign route clearance or route responders around the blockage.',
      detectedBy: 'system',
    })
  }

  // ─── 6. Communication lost (no timeline event for a long time) ──────────
  const recentEvents = await db.incidentEvent.findMany({
    where: { incidentId },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })
  const lastEventMin = minutesSince(recentEvents[0]?.createdAt)
  if (lastEventMin != null && lastEventMin > 30 && !['RESOLVED', 'CLOSED'].includes(incident.status)) {
    found.push({
      incidentId,
      kind: 'COMMS_LOST',
      severity: 'MEDIUM',
      title: 'No recent updates',
      detail: 'No incident updates recorded for ' + Math.round(lastEventMin) + ' minutes.',
      recommendedAction: 'Request a status check from the assigned resource.',
      detectedBy: 'system',
    })
  }

  // ─── 7. Resource contention — same unit wanted by several incidents ─────
  if (assignment) {
    const competing = await db.resourceAssignment.findMany({
      where: { resourceId: assignment.resourceId, status: 'ASSIGNED', incidentId: { not: incidentId } },
      select: { incidentId: true },
    })
    if (competing.length > 0) {
      found.push({
        incidentId,
        resourceId: assignment.resourceId,
        kind: 'RESOURCE_CONTENTION',
        severity: 'HIGH',
        title: 'Resource shared with another incident',
        detail: assignment.Resource.resourceCode + ' is concurrently assigned to ' + competing.length + ' other incident(s).',
        recommendedAction: 'Reassign this unit to the higher-priority incident and source an alternative.',
        detectedBy: 'system',
      })
    }
  }

  return found
}

const BOTTLENECK_SYSTEM = `You are a disaster-response operations analyst.
You receive REAL detected bottlenecks for one incident as JSON.
For each bottleneck, sharpen the recommended action for the duty officer.

Return STRICT JSON ONLY:
{ "recommendations": [ { "kind": "<the bottleneck kind, unchanged>", "action": "<one concrete sentence>" } ] }

Rules:
- Recommend only realistic actions using the information given. Never invent resources that were not listed.
- Never suggest an action that bypasses human officer approval.
- Keep each action under 180 characters.
- Output valid JSON parseable by JSON.parse.`

/**
 * Sweep active incidents, persist NEW bottlenecks, and return the open ones.
 * Idempotent: an already-OPEN bottleneck of the same kind for the same
 * incident/resource is not duplicated.
 */
export async function runBottleneckSweep(opts: { incidentId?: string; limit?: number } = {}) {
  const incidents = opts.incidentId
    ? await db.incident.findMany({ where: { id: opts.incidentId }, select: { id: true } })
    : await db.incident.findMany({
      where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(opts.limit ?? 25, 1), 100),
      select: { id: true },
    })

  let created = 0

  for (const inc of incidents) {
    let detected: DetectedBottleneck[] = []
    try {
      detected = await detectIncidentBottlenecks(inc.id)
    } catch (e) {
      console.error('[bottleneck] detection failed for', inc.id, e)
      continue
    }

    for (const b of detected) {
      // De-duplicate against an existing OPEN row of the same kind.
      const existing = await db.responseBottleneck.findFirst({
        where: {
          incidentId: b.incidentId,
          kind: b.kind,
          status: 'OPEN',
          ...(b.resourceId ? { resourceId: b.resourceId } : {}),
        },
      })
      if (existing) continue

      let recommendedAction = b.recommendedAction
      let detectedBy = b.detectedBy

      // Ask the AI to sharpen the recommendation, once per bottleneck.
      const ai = await askAI(
        BOTTLENECK_SYSTEM,
        JSON.stringify({ kind: b.kind, title: b.title, detail: b.detail, currentRecommendation: b.recommendedAction })
      )
      if (ai.ok) {
        const parsed = extractJson<{ recommendations?: { kind?: string; action?: string }[] }>(ai.content)
        const match = parsed?.recommendations?.find((r) => r?.kind === b.kind)
        if (match?.action && String(match.action).trim()) {
          recommendedAction = String(match.action).trim().slice(0, 400)
          detectedBy = 'ai'
        }
      }

      try {
        await db.responseBottleneck.create({
          data: {
            incidentId: b.incidentId,
            resourceId: b.resourceId ?? null,
            kind: b.kind,
            severity: b.severity,
            title: b.title,
            detail: b.detail,
            recommendedAction,
            detectedBy,
            status: 'OPEN',
          },
        })
        created++
        await recordIncidentEvent(b.incidentId, 'BOTTLENECK_DETECTED', {
          label: b.title + ' — ' + b.detail,
          kind: b.kind,
          severity: b.severity,
          recommendedAction,
        })
      } catch (e) {
        console.error('[bottleneck] failed to persist:', e)
      }
    }
  }

  const open = await listBottlenecks()
  return { created, open }
}

/**
 * List bottlenecks for the command center. Citizens never see internal
 * resource reasoning, so callers must gate this behind an officer check.
 */
export async function listBottlenecks(opts: { incidentId?: string; limit?: number } = {}) {
  const rows = await db.responseBottleneck.findMany({
    where: {
      status: 'OPEN',
      ...(opts.incidentId ? { incidentId: opts.incidentId } : {}),
    },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    take: Math.min(Math.max(opts.limit ?? 40, 1), 200),
    include: {
      Incident: { select: { incidentCode: true, type: true, location: true, status: true, riskLevel: true } },
      Resource: { select: { resourceCode: true, name: true, status: true } },
    },
  })

  return rows.map((b) => ({
    id: b.id,
    incidentId: b.incidentId,
    incidentCode: b.Incident?.incidentCode ?? null,
    incidentType: b.Incident?.type ?? null,
    incidentLocation: b.Incident?.location ?? null,
    resourceId: b.resourceId,
    resourceCode: b.Resource?.resourceCode ?? null,
    resourceName: b.Resource?.name ?? null,
    kind: b.kind,
    severity: b.severity,
    title: b.title,
    detail: b.detail,
    recommendedAction: b.recommendedAction,
    status: b.status,
    detectedBy: b.detectedBy,
    createdAt: b.createdAt.toISOString(),
  }))
}

/**
 * Officer decision on a bottleneck. AI proposes; a human disposes.
 */
export async function resolveBottleneck(params: {
  bottleneckId: string
  decision: 'RESOLVED' | 'DISMISSED' | 'ACKNOWLEDGED'
  note?: string
  userId: string
  userRole: string
}) {
  const row = await db.responseBottleneck.findUnique({ where: { id: params.bottleneckId } })
  if (!row) throw new Error('Bottleneck not found')

  const status = params.decision === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : params.decision

  await db.responseBottleneck.update({
    where: { id: params.bottleneckId },
    data: {
      status,
      resolvedById: params.userId,
      resolvedAt: new Date(),
      resolutionNote: params.note ?? null,
    },
  })

  await recordIncidentEvent(row.incidentId, 'BOTTLENECK_' + status, {
    label: row.title + ' marked ' + status + (params.note ? ' — ' + params.note : ''),
    kind: row.kind,
    note: params.note ?? null,
  })

  await recordAudit({
    userId: params.userId,
    role: params.userRole,
    action: 'BOTTLENECK_' + status,
    entityId: row.incidentId,
    previousState: row.status,
    newState: status,
    reason: params.note || 'Officer action on AI bottleneck recommendation',
  })

  return { id: params.bottleneckId, status }
}
