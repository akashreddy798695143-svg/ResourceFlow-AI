import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { haversineKm } from '@/lib/agents/resource-agent'

// Conservative urban emergency-vehicle average used for ETA estimation.
const ETA_AVG_SPEED_KPH = 30
// GET /api/incidents/track?code=RF-2026-000001
// Citizen-facing tracking: shows ONLY public-facing info (no internal AI/risk/resource intelligence).
// Reads the CURRENT incident status directly from the database — never cached.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')?.trim().toUpperCase()
    if (!code) return err('Missing code', 422)

    const incident = await db.incident.findUnique({ where: { incidentCode: code } })
    if (!incident) return err('Incident code not found', 404)

    // Privacy: a citizen may only track their own incident. Officers/admins may
    // track any incident; responders may track incidents assigned to a resource.
    if (user.role === 'CITIZEN' && incident.reportedById !== user.id) {
      return err('Incident code not found', 404)
    }

    // GAME-CHANGER #5: responder ETA + live tracking. The citizen sees ONLY the
    // responder assigned to THEIR incident.
    const responder = await buildResponderTracking(incident)

    // Compute the visual stage timeline (✓ done / ○ pending) from the incident's actual state.
    const stages = computeStages(incident)

    // The active stage determines the granular citizen-facing message + label.
    const activeStage = stages.find((s) => s.active)
    const currentStage = activeStage?.label || deriveStage(incident.status)
    const publicMessage = activeStage?.message || publicMessageFor(incident.status)

    // Email status — only expose the citizen's OWN email status (never other users' emails)
    const emailStatus = await db.emailNotification.findFirst({
      where: { incidentId: incident.id, emailType: 'CITIZEN_RESOLUTION_REPORT' },
      select: { status: true, sentAt: true },
    })

    return ok({
      incidentId: incident.id,
      incidentCode: incident.incidentCode,
      type: incident.type,
      status: incident.status,
      location: incident.location,
      reportedAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      escalationLevel: incident.escalationLevel,
      currentStage,
      publicMessage,
      stages,
      lastUpdate: incident.updatedAt,
      reportEmail: incident.resolutionEmailSent
        ? {
            sent: true,
            status: emailStatus?.status || 'PENDING',
            sentAt: emailStatus?.sentAt || incident.resolutionEmailSentAt,
          }
        : null,
      response: {
        assignedAt: incident.assignedAt,
        acknowledgedAt: incident.acknowledgedAt,
        startedAt: incident.startedAt,
        arrivedAt: incident.arrivedAt,
        resolvedAt: incident.resolvedAt,
      },
      // GAME-CHANGER #5: responder status, live position and ETA.
      responder,
    })
  } catch (e) {
    return handleAuthError(e)
  }
}

// Citizen-facing public messages. Kept in sync with src/lib/workflows/incident-workflow.ts.
function publicMessageFor(status: string): string {
  const map: Record<string, string> = {
    NEW: 'Your report has been received and is being processed.',
    ANALYZING: 'Our AI is analysing your report to understand the severity.',
    VERIFICATION: 'Your report is being verified and prioritised.',
    PRIORITIZED: 'Your report has been prioritised. A response team is being identified.',
    AWAITING_APPROVAL: 'A response team has been recommended. Awaiting officer approval.',
    ASSIGNED: 'A response team has been assigned to your incident.',
    IN_PROGRESS: 'A response team is working on your incident.',
    DELAYED: 'The response is delayed — the system is re-evaluating resources.',
    ESCALATED: 'Your incident has been escalated for priority handling.',
    RESOLVED: 'Your incident has been resolved.',
    CLOSED: 'Your incident has been closed.',
  }
  return map[status] || 'Status updated.'
}

function deriveStage(status: string): string {
  const map: Record<string, string> = {
    NEW: 'Report received',
    ANALYZING: 'Under review',
    VERIFICATION: 'Under review',
    PRIORITIZED: 'Verified',
    AWAITING_APPROVAL: 'Awaiting approval',
    ASSIGNED: 'Response team assigned',
    IN_PROGRESS: 'In progress',
    DELAYED: 'Response delayed',
    ESCALATED: 'Escalated',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
  }
  return map[status] || status
}

// Compute the 7-stage citizen timeline. Each stage has a label, "done" boolean, "active" boolean, and a citizen-facing message.
// Stages:
//   1. Report Received        — done if incident exists
//   2. Under Review            — done if status past NEW
//   3. Verified                — done if status past ANALYZING/VERIFICATION
//   4. Response Team Assigned  — done if assignedAt set
//   5. Responder En Route      — done if startedAt set
//   6. In Progress             — done if arrivedAt set
//   7. Resolved                — done if resolvedAt set
function computeStages(inc: any): Array<{ key: string; label: string; done: boolean; active: boolean; at?: string; message: string }> {
  const isReviewPassed = !['NEW'].includes(inc.status)
  const isVerified = ['PRIORITIZED', 'AWAITING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED', 'ESCALATED', 'RESOLVED', 'CLOSED'].includes(inc.status)
  const isAssigned = !!inc.assignedAt
  const isEnRoute = !!inc.startedAt
  const isOnScene = !!inc.arrivedAt
  const isResolved = !!inc.resolvedAt

  const stages = [
    {
      key: 'received',
      label: 'Report Received',
      done: true,
      active: inc.status === 'NEW' || inc.status === 'ANALYZING',
      at: inc.createdAt,
      message: 'Your report has been received and is being processed.',
    },
    {
      key: 'review',
      label: 'Under Review',
      done: isReviewPassed,
      active: ['ANALYZING', 'VERIFICATION'].includes(inc.status),
      message: 'Our AI is analysing your report to understand the severity.',
    },
    {
      key: 'verified',
      label: 'Verified',
      done: isVerified,
      active: inc.status === 'PRIORITIZED' || inc.status === 'AWAITING_APPROVAL',
      message: inc.status === 'AWAITING_APPROVAL'
        ? 'A response team has been recommended. Awaiting officer approval.'
        : 'Your report has been verified and prioritised. A response team is being identified.',
    },
    {
      key: 'assigned',
      label: 'Response Team Assigned',
      done: isAssigned,
      active: inc.status === 'ASSIGNED',
      at: inc.assignedAt ?? undefined,
      message: 'A response team has been assigned to your incident.',
    },
    {
      key: 'en_route',
      label: 'Responder En Route',
      done: isEnRoute,
      active: inc.status === 'IN_PROGRESS' && !inc.arrivedAt,
      at: inc.startedAt ?? undefined,
      message: 'Your response team is en route to the incident.',
    },
    {
      key: 'in_progress',
      label: 'In Progress',
      done: isOnScene,
      active: inc.status === 'IN_PROGRESS' && !!inc.arrivedAt,
      at: inc.arrivedAt ?? undefined,
      message: 'Your response team has arrived on scene. Work is in progress.',
    },
    {
      key: 'resolved',
      label: 'Resolved',
      done: isResolved,
      active: inc.status === 'RESOLVED',
      at: inc.resolvedAt ?? undefined,
      message: 'Your incident has been resolved.',
    },
  ]

  // Edge: if delayed/escalated, the active stage is the most-recent done stage with a flag
  if (inc.status === 'DELAYED' || inc.status === 'ESCALATED') {
    const lastDoneIdx = stages.map((s, i) => (s.done ? i : -1)).filter((i) => i >= 0).pop()
    if (lastDoneIdx != null) {
      stages.forEach((s, i) => {
        s.active = i === lastDoneIdx
        if (s.active) {
          s.message = inc.status === 'DELAYED'
            ? 'The response is delayed — the system is re-evaluating resources.'
            : 'Your incident has been escalated for priority handling.'
        }
      })
    }
  }

  return stages
}
// ─── GAME-CHANGER #5 — RESPONDER ETA + LIVE TRACKING ─────────────────────
// Builds the citizen-visible responder picture for ONE incident.
//
// PRIVACY: only the single resource assigned to this incident is ever exposed,
// and only its most recent authorized position. We never disclose other
// responders, other incidents, or a responder's history.
//
// HONESTY: if live location is unavailable or stale we say so explicitly and
// fall back to "last authorized update" — we never present a stale fix as live.
async function buildResponderTracking(incident: any) {
  if (!incident.assignedResourceId) {
    return {
      assigned: false,
      status: null,
      code: null,
      name: null,
      type: null,
      etaMinutes: null,
      distanceKm: null,
      live: false,
      sharingStatus: 'NOT_ASSIGNED',
      trackingState: 'NOT_ASSIGNED',
      trackingLabel: 'No responder assigned yet',
      lastAuthorizedUpdate: null,
      secondsSinceUpdate: null,
      destination: {
        latitude: incident.latitude,
        longitude: incident.longitude,
        name: incident.location,
      },
      consentRequired: true,
    }
  }

  const resource = await db.resource.findUnique({
    where: { id: incident.assignedResourceId },
    select: { id: true, resourceCode: true, name: true, type: true, status: true, eta: true },
  })
  if (!resource) {
    return {
      assigned: false,
      status: null,
      code: null,
      name: null,
      type: null,
      etaMinutes: null,
      distanceKm: null,
      live: false,
      sharingStatus: 'NOT_ASSIGNED',
      trackingState: 'NOT_ASSIGNED',
      trackingLabel: 'No responder assigned yet',
      lastAuthorizedUpdate: null,
      secondsSinceUpdate: null,
      destination: {
        latitude: incident.latitude,
        longitude: incident.longitude,
        name: incident.location,
      },
      consentRequired: true,
    }
  }

  // Most recent AUTHORIZED position from the responder's Go Live session.
  const latest = await db.responderLocationUpdate.findFirst({
    where: { resourceId: resource.id },
    orderBy: { timestamp: 'desc' },
  })

  const arrived = !!incident.arrivedAt
  const resolved = !!incident.resolvedAt

  let etaMinutes: number | null = null
  let distanceKm: number | null = null

  if (latest) {
    distanceKm = Math.round(
      haversineKm(latest.latitude, latest.longitude, incident.latitude, incident.longitude) * 100
    ) / 100
    etaMinutes = arrived || resolved ? 0 : Math.max(1, Math.round((distanceKm / ETA_AVG_SPEED_KPH) * 60))
  } else if (!arrived && !resolved && resource.eta != null) {
    // Fall back to the catalog ETA the resource was planned with — labelled as a
    // planned estimate, not a live measurement.
    etaMinutes = resource.eta
  }

  const secondsSinceUpdate = latest
    ? Math.round((Date.now() - latest.timestamp.getTime()) / 1000)
    : null

  // Only claim "live" when the fix is genuinely recent.
  const LIVE_THRESHOLD_SECONDS = 120
  const live = secondsSinceUpdate != null && secondsSinceUpdate <= LIVE_THRESHOLD_SECONDS

  let trackingState: string
  let trackingLabel: string

  if (resolved) {
    trackingState = 'RESOLVED'
    trackingLabel = 'Incident resolved'
  } else if (arrived) {
    trackingState = 'ON_SCENE'
    trackingLabel = 'Responder has arrived on scene'
  } else if (live) {
    trackingState = 'LIVE'
    trackingLabel = 'Live location available'
  } else if (latest) {
    trackingState = 'LAST_UPDATE'
    trackingLabel = 'Live location unavailable. Showing last authorized update.'
  } else {
    trackingState = 'UNAVAILABLE'
    trackingLabel = 'Live location unavailable. The responder has not shared a position.'
  }

  return {
    assigned: true,
    status: resource.status,
    code: resource.resourceCode,
    name: resource.name,
    type: resource.type,
    etaMinutes,
    distanceKm,
    live,
    sharingStatus: live ? 'SHARING' : latest ? 'STALE' : 'NOT_SHARING',
    trackingState,
    trackingLabel,
    // The single authorized position for display on the citizen's map.
    lastAuthorizedUpdate: latest
      ? {
          latitude: latest.latitude,
          longitude: latest.longitude,
          accuracy: latest.accuracy ?? null,
          timestamp: latest.timestamp.toISOString(),
        }
      : null,
    secondsSinceUpdate,
    destination: {
      latitude: incident.latitude,
      longitude: incident.longitude,
      name: incident.location,
    },
    consentRequired: true,
  }
}
