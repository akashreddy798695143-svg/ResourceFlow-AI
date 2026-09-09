import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'

// GET /api/incidents/[id] — full incident details (officer/admin/responder)
// For citizens: they can fetch their own incident by id.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await ctx.params
    const incident = await db.incident.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        approvals: { orderBy: { createdAt: 'desc' } },
        assignments: { orderBy: { assignedAt: 'asc' } },
        recommendations: { orderBy: { createdAt: 'desc' } },
        report: true,
        User: { select: { name: true } },
      },
    })
    if (!incident) return err('Incident not found', 404)
    if (user.role === 'CITIZEN') {
      if (incident.reportedById !== user.id) {
        return err('Forbidden — unauthorized incident access', 403)
      }
      // Public-safe view for reporting citizen
      return ok({
        incident: {
          id: incident.id,
          incidentCode: incident.incidentCode,
          type: incident.type,
          description: incident.description,
          location: incident.location,
          latitude: incident.latitude,
          longitude: incident.longitude,
          status: incident.status,
          createdAt: incident.createdAt,
          updatedAt: incident.updatedAt,
          assignedAt: incident.assignedAt,
          acknowledgedAt: incident.acknowledgedAt,
          startedAt: incident.startedAt,
          arrivedAt: incident.arrivedAt,
          resolvedAt: incident.resolvedAt,
          events: incident.events,
          resolutionEmailSent: incident.resolutionEmailSent,
        },
      })
    }
    return ok({ incident })
  } catch (e) {
    return handleAuthError(e)
  }
}
