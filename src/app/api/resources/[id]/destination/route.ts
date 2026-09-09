import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { recordIncidentEvent, recordAudit, broadcastEvent } from '@/lib/events'
import { haversineKm } from '@/lib/agents/resource-agent'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN', 'RESPONDER'])
    const { id: resourceId } = await ctx.params
    const { searchParams } = new URL(req.url)
    const incidentId = searchParams.get('incidentId') || undefined

    const destinations = await db.resourceDestination.findMany({
      where: { resourceId, ...(incidentId ? { incidentId } : {}) },
      orderBy: { lastUpdated: 'desc' },
    })
    return ok({ destinations })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const { id: resourceId } = await ctx.params
    const body = parseBody(await req.json())
    const { incidentId, destinationType, name, latitude, longitude, address } = body

    if (!incidentId || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return err('incidentId, name, latitude, longitude are required', 422)
    }
    if (!destinationType || !['INCIDENT','HOSPITAL','SAFE_ZONE','SHELTER','RELIEF_CENTER'].includes(destinationType)) {
      return err('Invalid destinationType', 422)
    }

    // Check resource exists
    const resource = await db.resource.findUnique({ where: { id: resourceId } })
    if (!resource) return err('Resource not found', 404)

    // Check incident exists and update resource destination fields
    const incident = await db.incident.findUnique({ where: { id: incidentId } })
    if (!incident) return err('Incident not found', 404)

    const data: any = {
      resourceId,
      incidentId,
      destinationType,
      name: String(name).slice(0, 300),
      latitude: Number(latitude),
      longitude: Number(longitude),
      status: 'EN_ROUTE',
      lastUpdated: new Date(),
    }
    if (address) data.address = String(address).slice(0, 500)

    const destination = await db.resourceDestination.create(data)

    // Update incident resource destination fields
    await db.incident.update({
      where: { id: incidentId },
      data: {
        resourceDestinationLatitude: Number(latitude),
        resourceDestinationLongitude: Number(longitude),
        resourceDestinationName: String(name).slice(0, 300),
        resourceDestinationType: destinationType,
      },
    })

    // Create tracking event
    await db.resourceTrackingEvent.create({
      data: {
        resourceId,
        incidentId,
        status: 'DISPATCHED',
        locationName: name,
        recordedById: user.id,
        reason: `Destination set to ${name} (${destinationType})`,
      },
    })

    // Update resource status if AVAILABLE
    if (resource.status === 'AVAILABLE') {
      await db.resource.update({
        where: { id: resourceId },
        data: { status: 'ASSIGNED', lastUpdated: new Date() },
      })
    }

    await recordIncidentEvent(incidentId, 'RESOURCE_DISPATCHED', {
      label: `Resource ${resourceId} dispatched to ${name}`,
      resourceId,
      destinationType,
      destinationName: name,
      recordedById: user.id,
    })
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'RESOURCE_DISPATCHED',
      entityId: destination.id,
      newState: 'DISPATCHED',
      reason: `Officer dispatched resource to ${name} for incident ${incident.incidentCode}`,
    })
    broadcastEvent({ type: 'RESOURCE_DISPATCHED', label: `Resource dispatched to ${name}`, incidentId, resourceId })

    return ok({ destination }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}