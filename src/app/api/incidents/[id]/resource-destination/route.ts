import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { recordIncidentEvent, recordAudit, broadcastEvent } from '@/lib/events'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN', 'RESPONDER'])
    const { id: incidentId } = await ctx.params
    const destinations = await db.resourceDestination.findMany({
      where: { incidentId },
      orderBy: { lastUpdated: 'desc' },
      include: { Resource: { select: { id: true, resourceCode: true, name: true, type: true, status: true } } },
    })
    return ok({ destinations })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const { id: incidentId } = await ctx.params
    const body = parseBody(await req.json())
    const { resourceId, destinationType, name, latitude, longitude, address } = body

    if (!resourceId || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return err('resourceId, name, latitude, longitude are required', 422)
    }

    // Create the destination
    const destination = await db.resourceDestination.create({
      data: {
        resourceId,
        incidentId,
        destinationType: destinationType || 'INCIDENT',
        name: String(name).slice(0, 300),
        latitude: Number(latitude),
        longitude: Number(longitude),
        status: 'EN_ROUTE',
        address: address ? String(address).slice(0, 500) : null,
      },
    })

    // Update incident resource destination fields
    await db.incident.update({
      where: { id: incidentId },
      data: {
        resourceDestinationLatitude: Number(latitude),
        resourceDestinationLongitude: Number(longitude),
        resourceDestinationName: String(name).slice(0, 300),
        resourceDestinationType: destinationType || 'INCIDENT',
      },
    })

    // Update resource status
    const resource = await db.resource.findUnique({ where: { id: resourceId } })
    if (resource && resource.status === 'AVAILABLE') {
      await db.resource.update({
        where: { id: resourceId },
        data: { status: 'ASSIGNED', lastUpdated: new Date() },
      })
    }

    // Create tracking event
    await db.resourceTrackingEvent.create({
      data: {
        resourceId,
        assignmentId: null,
        status: 'DISPATCHED',
        locationName: name,
        recordedById: user.id,
        reason: `Destination set to ${name} (${destinationType || 'INCIDENT'})`,
        incidentId: incidentId,
      },
    })

    await recordIncidentEvent(incidentId, 'RESOURCE_DISPATCHED', {
      label: `Resource ${resourceId} dispatched to ${name}`,
      resourceId,
      destinationType: destinationType || 'INCIDENT',
      destinationName: name,
      recordedById: user.id,
    })
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'RESOURCE_DISPATCHED',
      entityId: destination.id,
      newState: 'DISPATCHED',
      reason: `Officer dispatched resource to ${name} for incident ${incidentId}`,
    })
    broadcastEvent({ type: 'RESOURCE_DISPATCHED', label: `Resource dispatched to ${name}`, incidentId, resourceId })

    return ok({ destination }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}