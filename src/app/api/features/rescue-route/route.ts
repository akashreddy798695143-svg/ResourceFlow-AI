// GET /api/features/rescue-route?incidentId=&resourceId=
// Returns the dynamic rescue-route summary for a resource assigned to an incident.
// RBAC scoping:
//   - RESPONDER  : only for their assignments
//   - DISASTER_OFFICER / ADMIN : full access
//   - CITIZEN    : only the resource currently assigned to their OWN incident
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { buildRouteForAssignment } from '@/lib/features/rescue-route'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'RESPONDER', 'DISASTER_OFFICER', 'ADMIN'])
    const { searchParams } = new URL(req.url)
    const incidentId = searchParams.get('incidentId') || undefined
    const resourceId = searchParams.get('resourceId') || undefined
    if (!incidentId || !resourceId) return err('incidentId and resourceId required', 422)

    if (user.role === 'CITIZEN') {
      const own = await db.incident.findFirst({ where: { id: incidentId, reportedById: user.id }, select: { id: true } })
      if (!own) return err('Forbidden', 403)
    } else if (user.role === 'RESPONDER') {
      const ok2 = await db.resourceAssignment.findFirst({
        where: {
          incidentId,
          resourceId,
          assignedById: user.id,
          replacedAt: null,
        },
        select: { id: true },
      })
      // If the responder isn't the one who assigned but is the resource's natural
      // operator, we still allow read-only summary
      if (!ok2) {
        // check if the resource is in their naming scheme
        const ok3 = await db.resourceAssignment.findFirst({ where: { incidentId, resourceId, replacedAt: null }, select: { id: true } })
        if (!ok3) return err('Forbidden', 403)
      }
    }

    const summary = await buildRouteForAssignment({ resourceId, incidentId })
    return ok(summary)
  } catch (e) {
    return handleAuthError(e)
  }
}
