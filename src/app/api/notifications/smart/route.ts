import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { haversineKm } from '@/lib/agents/resource-agent'

// Returns context-aware smart notifications: nearby incidents, resource
// status changes, safe places, emergency services — ranked by proximity
// and severity.
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['DISASTER_OFFICER', 'ADMIN', 'RESPONDER', 'CITIZEN'])
    const url = new URL(req.url)
    const lat = parseFloat(url.searchParams.get('lat') ?? '0')
    const lng = parseFloat(url.searchParams.get('lng') ?? '0')
    const radiusKm = parseFloat(url.searchParams.get('radius') ?? '10')
    const uids = url.searchParams.get('userIds')?.split(',').filter(Boolean) ?? []
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      return err('lat and lng are required query params', 400)
    }

    const nearby = await db.incident.findMany({
      where: {
        status: { in: ['NEW', 'ANALYZING', 'VERIFICATION', 'PRIORITIZED', 'AWAITING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED', 'ESCALATED'] },
        ...(uids.length ? { reportedById: { in: uids } } : {}),
      },
      include: {
        User: { select: { id: true, name: true } },
        ResourceAssignment: { include: { Resource: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    const safePlaces = await db.safePlace.findMany({
      select: { id: true, name: true, type: true, latitude: true, longitude: true, address: true, availability: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    const emergencyServices = await db.emergencyService.findMany({
      select: { id: true, name: true, type: true, latitude: true, longitude: true, phone: true, address: true, availability: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })

    const scored: { type: string; id: string; title: string; lat: number; lng: number; distanceKm: number; severity?: number; status?: string; meta?: Record<string, unknown> }[] = []

    for (const incident of nearby) {
      const d = haversineKm(lat, lng, incident.latitude, incident.longitude)
      if (d > radiusKm) continue
      const sev = incident.aiSeverity === 'CRITICAL' ? 5 : incident.aiSeverity === 'HIGH' ? 4 : incident.aiSeverity === 'MEDIUM' ? 3 : 2
      scored.push({
        type: 'incident',
        id: incident.id,
        title: incident.incidentCode + ' - ' + incident.type,
        lat: incident.latitude,
        lng: incident.longitude,
        distanceKm: Math.round(d * 100) / 100,
        severity: sev,
        status: incident.status,
        meta: {
          reportedById: incident.reportedById,
          description: incident.description ?? null,
          createdAt: incident.createdAt?.toISOString() ?? null,
          joinedCount: incident.ResourceAssignment?.length ?? 0,
        },
      })
    }

    for (const sp of safePlaces) {
      const d = haversineKm(lat, lng, sp.latitude, sp.longitude)
      if (d > radiusKm) continue
      scored.push({
        type: 'safePlace',
        id: sp.id,
        title: sp.name ?? 'Safe Place',
        lat: sp.latitude,
        lng: sp.longitude,
        distanceKm: Math.round(d * 100) / 100,
        status: sp.availability ?? undefined,
        meta: {
          type: sp.type ?? 'shelter',
          address: sp.address ?? null,
          createdAt: sp.createdAt?.toISOString() ?? null,
        },
      })
    }

    for (const es of emergencyServices) {
      const d = haversineKm(lat, lng, es.latitude, es.longitude)
      if (d > radiusKm) continue
      scored.push({
        type: 'emergencyService',
        id: es.id,
        title: es.name ?? 'Emergency Service',
        lat: es.latitude,
        lng: es.longitude,
        distanceKm: Math.round(d * 100) / 100,
        status: es.availability ?? undefined,
        meta: {
          type: es.type ?? 'hospital',
          phone: es.phone ?? null,
          address: es.address ?? null,
          createdAt: es.createdAt?.toISOString() ?? null,
        },
      })
    }

    scored.sort((a, b) => {
      const sevDiff = (b.severity ?? 3) - (a.severity ?? 3)
      if (sevDiff !== 0) return sevDiff
      return a.distanceKm - b.distanceKm
    })

    const seen = new Set<string>()
    const deduped: typeof scored = []
    for (const item of scored) {
      const key = `${item.type}:${item.id}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(item)
    }

    return ok({
      notifications: deduped.slice(0, 50),
      meta: {
        userLocation: { lat, lng },
        radiusKm,
        count: deduped.length,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (e) {
    console.error('[smart-notifications]', e)
    return handleAuthError(e)
  }
}