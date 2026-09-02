import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'

// GET /api/incidents/track?code=RF-2026-000001
// Citizen-facing tracking: shows ONLY public-facing info (no internal AI/risk/resource intelligence).
// Reads the CURRENT incident status directly from the database — never cached.
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')?.trim().toUpperCase()
    if (!code) return err('Missing code', 422)

    const incident = await db.incident.findUnique({ where: { incidentCode: code } })
    if (!incident) return err('Incident code not found', 404)

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
