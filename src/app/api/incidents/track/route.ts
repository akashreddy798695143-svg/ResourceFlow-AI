import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'

// GET /api/incidents/track?code=RF-2026-000001
// Citizen-facing tracking: shows only public-facing info (no internal AI/audit data).
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')?.trim().toUpperCase()
    if (!code) return err('Missing code', 422)

    const incident = await db.incident.findUnique({ where: { incidentCode: code } })
    if (!incident) return err('Incident code not found', 404)

    // Public-facing only
    return ok({
      incidentCode: incident.incidentCode,
      type: incident.type,
      status: incident.status,
      location: incident.location,
      reportedAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      escalationLevel: incident.escalationLevel,
      stage: deriveStage(incident.status),
      lastUpdate: incident.updatedAt,
      response: {
        assignedAt: incident.assignedAt,
        acknowledgedAt: incident.acknowledgedAt,
        arrivedAt: incident.arrivedAt,
        resolvedAt: incident.resolvedAt,
      },
    })
  } catch (e) {
    return handleAuthError(e)
  }
}

function deriveStage(status: string): string {
  const map: Record<string, string> = {
    NEW: 'Report received',
    ANALYZING: 'AI analysis in progress',
    VERIFICATION: 'Verifying report',
    PRIORITIZED: 'Risk prioritised',
    AWAITING_APPROVAL: 'Awaiting officer approval',
    ASSIGNED: 'Resource assigned',
    IN_PROGRESS: 'Response in progress',
    DELAYED: 'Response delayed — re-evaluating',
    ESCALATED: 'Escalated',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
  }
  return map[status] || status
}
