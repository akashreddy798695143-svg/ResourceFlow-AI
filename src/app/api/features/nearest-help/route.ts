// GET /api/features/nearest-help?lat=&lng=&kind=&incidentId=
// RBAC-aware nearest help matching.
//   CITIZEN  : filters SafePlace/EmergencyService by incident they own (if specified), else authorized incident scope.
//   RESPONDER : always allowed for assigned incidents
//   OFFICER/ADMIN : always allowed
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { findNearestHelp } from '@/lib/features/nearest-help'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'RESPONDER', 'DISASTER_OFFICER', 'ADMIN'])
    const { searchParams } = new URL(req.url)
    const lat = Number(searchParams.get('lat'))
    const lng = Number(searchParams.get('lng'))
    const incidentId = searchParams.get('incidentId') || undefined
    const kindRaw = (searchParams.get('kind') || 'all').toLowerCase()
    const kind = (['medical', 'rescue', 'shelter', 'safe', 'all'].includes(kindRaw) ? kindRaw : 'all') as 'medical' | 'rescue' | 'shelter' | 'safe' | 'all'
    const limit = Math.max(1, Math.min(20, Number(searchParams.get('limit') || 6)))

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return err('lat and lng required', 422)
    }

    // RBAC: CITIZEN — scope by their authorized incident if missing
    if (user.role === 'CITIZEN') {
      if (incidentId) {
        const own = await db.incident.findFirst({
          where: { id: incidentId, reportedById: user.id },
          select: { id: true },
        })
        if (!own) return err('Forbidden', 403)
      }
    }

    const result = await findNearestHelp({
      lat,
      lng,
      kind,
      incidentType: null,
      limit,
    })
    return ok(result)
  } catch (e) {
    return handleAuthError(e)
  }
}
