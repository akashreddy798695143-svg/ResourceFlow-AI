import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { haversineKm } from '@/lib/agents/resource-agent'

// GET /api/emergency-services/nearby?lat=&lng=&incidentId=&type=&limit=
// Returns nearby emergency services (hospitals, fire stations, police, etc.)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN', 'RESPONDER'])
    const { searchParams } = new URL(req.url)
    const lat = Number(searchParams.get('lat'))
    const lng = Number(searchParams.get('lng'))
    const incidentId = searchParams.get('incidentId') || undefined
    const type = searchParams.get('type') || undefined
    const limit = Math.min(200, Number(searchParams.get('limit') || 50))

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return err('lat and lng required', 422)
    }

    const where: any = {}
    if (type) where.type = type
    if (incidentId) where.incidentId = incidentId

    const services = await db.emergencyService.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Calculate distance from supplied location
    const withDistances = services.map(s => {
      const distKm = haversineKm(lat, lng, s.latitude, s.longitude)
      return {
        ...s,
        distanceKm: Math.round(distKm * 100) / 100,
      }
    })

    // Sort by distance
    withDistances.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))

    return ok({ emergencyServices: withDistances, count: withDistances.length, referenceLat: lat, referenceLng: lng })
  } catch (e) {
    return handleAuthError(e)
  }
}