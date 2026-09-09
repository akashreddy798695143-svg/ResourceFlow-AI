import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { haversineKm } from '@/lib/agents/resource-agent'

// GET /api/safe-places?lat=&lng=&incidentId=&citizenId=&type=&limit=
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN', 'RESPONDER'])
    const { searchParams } = new URL(req.url)
    const lat = Number(searchParams.get('lat'))
    const lng = Number(searchParams.get('lng'))
    const incidentId = searchParams.get('incidentId') || undefined
    const citizenId = searchParams.get('citizenId') || (user.role === 'CITIZEN' ? user.id : undefined)
    const type = searchParams.get('type') || undefined
    const limit = Math.min(200, Number(searchParams.get('limit') || 50))

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return err('lat and lng required', 422)
    }

    const where: any = {}
    if (type) where.type = type
    if (incidentId) where.incidentId = incidentId
    if (citizenId) where.citizenId = citizenId

    const places = await db.safePlace.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Calculate distance from supplied location for each
    const withDistances = places.map(p => {
      const distKm = haversineKm(lat, lng, p.latitude, p.longitude)
      const etaMinutes = distKm > 0 ? Math.max(1, Math.round(distKm * 3 + Math.random() * 2)) : 0
      return {
        ...p,
        distanceKm: Math.round(distKm * 100) / 100,
        estimatedTime: etaMinutes,
      }
    })

    // Sort by distance
    withDistances.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))

    return ok({ safePlaces: withDistances, count: withDistances.length, referenceLat: lat, referenceLng: lng })
  } catch (e) {
    return handleAuthError(e)
  }
}