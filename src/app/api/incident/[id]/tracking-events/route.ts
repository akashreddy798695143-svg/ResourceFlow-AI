import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { recordIncidentEvent, recordAudit, broadcastEvent } from '@/lib/events'
import { haversineKm } from '@/lib/agents/resource-agent'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN', 'RESPONDER'])
    const { id: incidentId } = await ctx.params
    const events = await db.resourceTrackingEvent.findMany({
      where: { incidentId },
      orderBy: { timestamp: 'asc' },
      include: {
        Resource: { select: { id: true, resourceCode: true, name: true, type: true } },
        User: { select: { id: true, name: true } },
      },
    })
    return ok({ events })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN', 'RESPONDER'])
    const { id: incidentId } = await ctx.params
    const body = parseBody(await req.json())
    const { resourceId, status, latitude, longitude, locationName, details, reason } = body

    if (!resourceId || !status) return err('resourceId and status are required', 422)
    const validStatuses = ['REQUESTED','APPROVED','ASSIGNED','DISPATCHED','EN_ROUTE','ARRIVED','COMPLETED']
    if (!validStatuses.includes(status)) return err('Invalid status', 422)

    // Auto-detect arrival if status is ARRIVED and check proximity to destination
    let autoVerified = false
    if (status === 'ARRIVED') {
      const dest = await db.resourceDestination.findFirst({
        where: { resourceId, incidentId, status: { not: 'ARRIVED' } },
        orderBy: { lastUpdated: 'desc' },
      })
      if (dest && Number.isFinite(latitude) && Number.isFinite(longitude)) {
        const distKm = haversineKm(latitude, longitude, dest.latitude, dest.longitude)
        if (distKm <= 0.3) autoVerified = true // Within 300m = auto-verified
      }
    }

    const event = await db.resourceTrackingEvent.create({
      data: {
        resourceId,
        assignmentId: null,
        incidentId,
        status,
        latitude: latitude != null ? Number(latitude) : null,
        longitude: longitude != null ? Number(longitude) : null,
        locationName: locationName ? String(locationName).slice(0, 300) : null,
        details: details ? JSON.stringify(details) : null,
        recordedById: user.id,
        reason: reason ? String(reason).slice(0, 500) : null,
      },
    })

    // Update incident arrival verification flags (Feature 5)
    if (status === 'ARRIVED') {
      await db.incident.update({
        where: { id: incidentId },
        data: {
          autoArrivalVerified: autoVerified,
          manualArrivalConfirmed: !autoVerified,
          arrivalVerifiedById: user.id,
          arrivalVerifiedAt: new Date(),
        },
      })
      // Update resource status to ARRIVED if it was ON_SCENE or EN_ROUTE
      const resource = await db.resource.findUnique({ where: { id: resourceId } })
      if (resource && (resource.status === 'ON_SCENE' || resource.status === 'EN_ROUTE')) {
        await db.resource.update({
          where: { id: resourceId },
          data: { status: 'ARRIVED', lastUpdated: new Date() },
        })
      }
    }

    // Also update incident timeline fields
    if (status === 'ARRIVED') {
      await db.incident.update({
        where: { id: incidentId },
        data: { arrivedAt: new Date() },
      })
    }

    await recordIncidentEvent(incidentId, 'RESOURCE_STATUS_CHANGE', {
      label: `Resource ${resourceId} status → ${status}`,
      resourceId,
      status,
      autoVerified,
      recordedById: user.id,
    })
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'RESOURCE_STATUS_CHANGE',
      entityId: event.id,
      newState: status,
      reason: `Tracking event: ${status} for resource ${resourceId}`,
    })
    broadcastEvent({ type: 'RESOURCE_STATUS_CHANGE', label: `Resource ${resourceId} → ${status}`, incidentId, resourceId })

    return ok({ event }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}