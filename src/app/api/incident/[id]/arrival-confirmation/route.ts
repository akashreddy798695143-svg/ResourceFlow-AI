import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { recordIncidentEvent, recordAudit, broadcastEvent } from '@/lib/events'
import { haversineKm } from '@/lib/agents/resource-agent'
import { dispatchNotification, getUsersByRole } from '@/lib/services/notification-service'
import { sendEmail } from '@/lib/services/email-service'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN', 'RESPONDER'])
    const { id: incidentId } = await ctx.params
    const body = parseBody(await req.json())
    const { resourceId, mode = 'manual', latitude, longitude } = body

    if (!resourceId) return err('resourceId is required', 422)

    // Find the latest non-arrived destination for this resource+incident
    const dest = await db.resourceDestination.findFirst({
      where: { resourceId, incidentId, status: { not: 'ARRIVED' } },
      orderBy: { lastUpdated: 'desc' },
    })
    if (!dest) return err('No active destination for this resource and incident', 404)

    // Calculate distance to destination
    let distanceToDest: number | null = null
    let autoVerified = false
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      distanceToDest = haversineKm(latitude, longitude, dest.latitude, dest.longitude)
      // Auto-verify if within 500m
      if (distanceToDest <= 0.5) autoVerified = true
    }

    const isAuto = mode === 'auto'
    const confirmed = isAuto ? autoVerified : true // Manual mode: officer confirms

    if (isAuto && !autoVerified) {
      return ok({
        confirmed: false,
        reason: 'Resource not close enough to destination for auto-verification',
        distanceToDest: distanceToDest ? Math.round(distanceToDest * 1000) / 1000 : null,
        thresholdMeters: 500,
      })
    }

    // Update the destination as arrived
    const arrivedAt = new Date()
    const destination = await db.resourceDestination.update({
      where: { id: dest.id },
      data: {
        status: 'ARRIVED',
        arrivedAt,
        autoVerified: isAuto ? true : false,
        confirmedById: isAuto ? null : user.id,
        confirmedAt: isAuto ? null : arrivedAt,
        lastUpdated: arrivedAt,
      },
    })

    // Update incident arrival verification flags (Feature 5)
    await db.incident.update({
      where: { id: incidentId },
      data: {
        autoArrivalVerified: isAuto,
        manualArrivalConfirmed: !isAuto,
        arrivalVerifiedById: user.id,
        arrivalVerifiedAt: arrivedAt,
      },
    })

    // Update resource status to ARRIVED
    const resource = await db.resource.findUnique({ where: { id: resourceId } })
    if (resource && (resource.status === 'ON_SCENE' || resource.status === 'EN_ROUTE')) {
      await db.resource.update({
        where: { id: resourceId },
        data: { status: 'ARRIVED', lastUpdated: arrivedAt },
      })
    }

    // Update incident arrivedAt timestamp
    await db.incident.update({
      where: { id: incidentId },
      data: { arrivedAt },
    })

    // Create tracking event
    const trackingEvent = await db.resourceTrackingEvent.create({
      data: {
        resourceId,
        incidentId,
        status: 'ARRIVED',
        latitude: latitude != null ? Number(latitude) : null,
        longitude: longitude != null ? Number(longitude) : null,
        locationName: dest.name,
        details: distanceToDest != null ? JSON.stringify({ distanceRemaining: Math.round(distanceToDest*1000)/1000, etaMinutes: 0, autoVerified }) : null,
        recordedById: user.id,
        reason: isAuto ? `Auto-verified arrival (within ${Math.round(distanceToDest! * 1000)}m)` : `Manual arrival confirmed by officer`,
      },
    })

    await recordIncidentEvent(incidentId, 'RESOURCE_ARRIVED', {
      label: `Resource ${resourceId} arrived at ${dest.name}`,
      resourceId,
      destinationId: dest.id,
      mode: isAuto ? 'auto' : 'manual',
      distanceToDest: distanceToDest ? Math.round(distanceToDest * 1000) / 1000 : null,
      recordedById: user.id,
    })
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'RESOURCE_ARRIVED',
      entityId: dest.id,
      newState: 'ARRIVED',
      reason: `Resource arrived at ${dest.name} (${isAuto ? 'auto-verified' : 'manual confirmation'})`,
    })
        broadcastEvent({ type: 'RESOURCE_ARRIVED', label: `Resource arrived at ${dest.name}`, incidentId, resourceId })

    // Send auto-notification:
    //  - Citizen receives an email (via existing Gmail/SMTP infrastructure)
    //  - Officer/Admin receive an in-app notification
    // These run asynchronously and never block the response.
    ;(async () => {
      try {
        const fullIncident = await db.incident.findUnique({
          where: { id: incidentId },
          select: { incidentCode: true, type: true, reportedById: true, description: true },
        })
        const citizen = fullIncident ? await db.user.findUnique({ where: { id: fullIncident.reportedById }, select: { id: true, email: true, name: true } }) : null
        const officers = await getUsersByRole(['DISASTER_OFFICER', 'ADMIN', 'RESPONDER'])

        if (citizen?.email) {
          // Best-effort citizen email. Uses the existing email-service (graceful fallback if SMTP unavailable).
          sendEmail({
            to: citizen.email,
            subject: `Resource arrived — Incident ${fullIncident?.incidentCode || ''}`,
            html: `<p>Hello ${citizen.name || 'there'},</p><p>A responding resource has arrived at ${dest.name} for your incident.</p><p>Incident: ${fullIncident?.type || ''} (${fullIncident?.incidentCode || ''})</p><p>Status: ARRIVED (${isAuto ? 'auto-verified' : 'manually confirmed'})</p><p>This is an automated notification from ResourceFlow AI.</p>`,
          }).catch(() => {})
        }
        if (officers.length > 0) {
          await dispatchNotification('INCIDENT_RESOLVED', officers, {
            incidentId,
            title: 'Resource Arrived',
            message: `Resource ${resourceId} arrived at ${dest.name} for incident ${fullIncident?.incidentCode || ''}`,
          })
        }
      } catch (e) {
        console.error('[arrival-confirmation] notification error:', e)
      }
    })().catch(() => {})

    return ok({
      destination,
      trackingEvent,
      confirmed: true,
      mode: isAuto ? 'auto' : 'manual',
      arrivedAt: arrivedAt.toISOString(),
    })
  } catch (e) {
    return handleAuthError(e)
  }
}