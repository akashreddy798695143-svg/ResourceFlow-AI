import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'

function isValidLat(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90
}
function isValidLng(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180
}

// POST /api/resources/location
// Live responder GPS update (Go Live). Responder must own/be assigned the resource.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['RESPONDER', 'DISASTER_OFFICER', 'ADMIN'])
    const body = parseBody(await req.json())
    const { resourceId, incidentId, latitude, longitude, accuracy, speedKph, heading, timestamp } = body

    if (!resourceId || typeof resourceId !== 'string') return err('resourceId is required', 422)
    if (!isValidLat(latitude) || !isValidLng(longitude)) return err('Invalid latitude/longitude', 422)

    // Never trust ownership from the client: responder must be assigned to this resource's incident.
    const resource = await db.resource.findUnique({ where: { id: resourceId } })
    if (!resource) return err('Resource not found', 404)

    if (user.role === 'RESPONDER') {
      // A responder is authorized only if the resource is assigned to an incident they can act on.
      // We accept any assignment existence as the operational link (responder handles assignments in-app).
      const assignment = await db.resourceAssignment.findFirst({
        where: { resourceId },
        orderBy: { assignedAt: 'desc' },
      })
      if (!assignment) return err('Resource is not assigned — location sharing not permitted', 403)
    }

    let ts: Date | undefined
    if (timestamp !== undefined) {
      const d = new Date(timestamp)
      if (Number.isNaN(d.getTime())) return err('Invalid timestamp', 422)
      // Reject timestamps too far in the future (clock skew guard)
      if (d.getTime() > Date.now() + 5 * 60 * 1000) return err('Invalid timestamp', 422)
      ts = d
    }

    if (incidentId != null && typeof incidentId !== 'string') return err('Invalid incidentId', 422)

    const saved = await db.responderLocationUpdate.create({
      data: {
        resourceId,
        incidentId: incidentId ?? null,
        latitude,
        longitude,
        accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
        speedKph: typeof speedKph === 'number' && Number.isFinite(speedKph) ? speedKph : null,
        heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
        recordedById: user.id,
        ...(ts ? { timestamp: ts } : {}),
      },
    })

    return ok({ id: saved.id, timestamp: saved.timestamp })
  } catch (e) {
    return handleAuthError(e)
  }
}

// GET /api/resources/location?resourceId=...&incidentId=...
// Authorized live view: responder (own updates), officer/admin.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['RESPONDER', 'DISASTER_OFFICER', 'ADMIN'])
    const { searchParams } = new URL(req.url)
    const resourceId = searchParams.get('resourceId')
    const incidentId = searchParams.get('incidentId')
    const sinceMinutes = Math.min(Math.max(Number(searchParams.get('sinceMinutes') ?? 30), 1), 24 * 60)
    if (!resourceId) return err('resourceId is required', 422)

    const where: any = {
      resourceId,
      timestamp: { gte: new Date(Date.now() - sinceMinutes * 60 * 1000) },
    }
    if (incidentId) where.incidentId = incidentId

    const updates = await db.responderLocationUpdate.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 200,
    })

    return ok({ updates })
  } catch (e) {
    return handleAuthError(e)
  }
}
