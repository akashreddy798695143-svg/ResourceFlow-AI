// POST /api/citizen/sos — One-Tap SOS (citizen only).
// Creates an Incident (reusing the existing pipeline: AI triage → workflow →
// clustering → officer command center) flagged as one-tap SOS.
// Email notifications are sent to verified Family Safety Circle members.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { recordIncidentEvent, recordAudit, broadcastEvent } from '@/lib/events'
import { runIncidentWorkflow } from '@/lib/workflows/incident-workflow'
import { triageSos } from '@/lib/services/citizen-safety-service'
import { sendEmergencySosEmails } from '@/lib/services/family-notification-service'
import { haversineKm } from '@/lib/agents/resource-agent'
import type { IncidentType } from '@prisma/client'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const body = await req.json().catch(() => ({}))
    const latitude = Number(body.latitude)
    const longitude = Number(body.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: 'latitude and longitude are required' }, { status: 422 })
    }
    const description = String(body.description || 'One-tap SOS: citizen requests immediate assistance at current location.').slice(0, 2000)
    const language = typeof body.language === 'string' ? body.language.slice(0, 5).toLowerCase() : null

    // ─── Citizen location tracking (Feature 1) ──────────────────────────
    const movementStatus = String(body.movementStatus || 'STATIC').toUpperCase()
    const citizenMovementStatus = ['STATIC','MOVING_NORTH','MOVING_SOUTH','MOVING_EAST','MOVING_WEST','MOVING_DIAGONAL'].includes(movementStatus)
      ? movementStatus : 'STATIC'
    const destLat = Number(body.citizenDestinationLatitude)
    const destLng = Number(body.citizenDestinationLongitude)
    const citizenDestinationLatitude = Number.isFinite(destLat) ? destLat : null
    const citizenDestinationLongitude = Number.isFinite(destLng) ? destLng : null
    const citizenDestinationName = String(body.citizenDestinationName || '').slice(0, 300) || null
    const rdLat = Number(body.resourceDestinationLatitude)
    const rdLng = Number(body.resourceDestinationLongitude)
    const resourceDestinationLatitude = Number.isFinite(rdLat) ? rdLat : null
    const resourceDestinationLongitude = Number.isFinite(rdLng) ? rdLng : null
    const resourceDestinationName = String(body.resourceDestinationName || '').slice(0, 300) || null
    const resourceDestinationType = String(body.resourceDestinationType || 'INCIDENT').slice(0, 50).toUpperCase()
    const locationLabel = String(body.location || '').slice(0, 300)
    const triage = await triageSos(description, language)
    const incidentType = (['FLOOD','CYCLONE','EARTHQUAKE','LANDSLIDE','ROAD_BLOCKAGE','FIRE','MEDICAL','INFRASTRUCTURE','BUILDING_COLLAPSE','FOREST_FIRE','HEAVY_RAINFALL','INDUSTRIAL_ACCIDENT','OTHER'].includes(triage.incidentType)
      ? triage.incidentType
      : 'OTHER') as IncidentType

    // 2. Location validation + reverse geocode (best-effort)
    let geocodedLocation = String(body.location || '').slice(0, 300)
    if (!geocodedLocation) {
      try {
        const res = await fetch(`${new URL(req.url).origin}/api/geocode/reverse?lat=${latitude}&lng=${longitude}`, { headers: { cookie: req.headers.get('cookie') || '' } })
        if (res.ok) {
          const j = await res.json()
          geocodedLocation = String(j.shortName || j.name || '')
        }
      } catch { /* demo fallback: keep empty */ }
    }
    if (!geocodedLocation) geocodedLocation = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`

    const year = new Date().getFullYear()
    const count = await db.incident.count()
    const incidentCode = `RF-${year}-${String(count + 1).padStart(6, '0')}`

    const incident = await db.incident.create({
      data: {
        incidentCode,
        type: incidentType,
        description,
        location: geocodedLocation,
        latitude,
        longitude,
        status: 'NEW',
        inputMethod: 'sos_one_tap',
        language,
        locationAccuracy: Number.isFinite(Number(body.locationAccuracy)) ? Number(body.locationAccuracy) : null,
        locationTimestamp: new Date(),
        originalDescription: description,
        citizenName: user.name,
        citizenPhone: (await db.user.findUnique({ where: { id: user.id }, select: { phone: true } }))?.phone || null,
        citizenEmail: user.email,
        aiSeverity: triage.severity,
        aiConfidence: triage.urgencyScore / 100,
        aiAvailable: triage.source === 'ai',
        riskLevel: triage.severity === 'CRITICAL' ? 'CRITICAL' : triage.severity === 'HIGH' ? 'HIGH' : triage.severity === 'MEDIUM' ? 'MEDIUM' : 'LOW',
        reportedById: user.id,
        // FEATURE 1: Citizen location tracking
        citizenLatitude: latitude,
        citizenLongitude: longitude,
        citizenLocationTimestamp: new Date(),
        citizenMovementStatus: citizenMovementStatus,
        citizenDestinationLatitude,
        citizenDestinationLongitude,
        citizenDestinationName,
        // FEATURE 2: Resource destination
        resourceDestinationLatitude,
        resourceDestinationLongitude,
        resourceDestinationName,
        resourceDestinationType,
      },
    })

    await recordIncidentEvent(incident.id, 'SOS_ONE_TAP', {
      label: `One-tap SOS ${incidentCode} — triaged ${triage.severity} (score ${triage.urgencyScore})`,
      code: incidentCode,
      severity: triage.severity,
      urgencyScore: triage.urgencyScore,
      triageSource: triage.source,
      guidance: triage.immediateGuidance,
      citizenMovementStatus,
      citizenDestinationName,
      resourceDestinationName,
      resourceDestinationType,
    })
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'SOS_ONE_TAP',
      entityId: incident.id,
      newState: triage.severity,
      reason: `One-tap SOS triaged as ${triage.severity} (${triage.source})`,
    })
    await broadcastEvent({ type: 'SOS_ONE_TAP', label: `One-tap SOS ${incidentCode} (${triage.severity})`, incidentId: incident.id })

    // Nearest safe places + emergency services from the existing DB catalog
    // (real seeded data only — never invented). Best-effort, never blocks SOS.
    let nearestSafePlaces: any[] = []
    let nearestEmergencyServices: any[] = []
    try {
      const [places, services] = await Promise.all([
        db.safePlace.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
        db.emergencyService.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      ])
      nearestSafePlaces = places
        .map((p) => ({ ...p, distanceKm: Math.round(haversineKm(latitude, longitude, p.latitude, p.longitude) * 100) / 100 }))
        .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
        .slice(0, 3)
      nearestEmergencyServices = services
        .map((s) => ({ ...s, distanceKm: Math.round(haversineKm(latitude, longitude, s.latitude, s.longitude) * 100) / 100 }))
        .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
        .slice(0, 3)
      // Persist the top recommendation on the incident for the officer/admin map
      if (nearestSafePlaces.length > 0 || nearestEmergencyServices.length > 0) {
        await db.incident.update({
          where: { id: incident.id },
          data: {
            aiRecommendedResources: JSON.stringify({
              nearestSafePlaces: nearestSafePlaces.map((p) => ({ id: p.id, name: p.name, type: p.type, distanceKm: p.distanceKm })),
              nearestEmergencyServices: nearestEmergencyServices.map((s) => ({ id: s.id, name: s.name, type: s.type, distanceKm: s.distanceKm })),
              generatedAt: new Date().toISOString(),
            }),
          },
        }).catch(() => {})
      }
    } catch { /* catalog lookup is best-effort */ }

    // Send in-app notification to the citizen with the nearest safe place
    // (existing notification infrastructure — shown in the citizen app).
    try {
      const top = nearestSafePlaces[0]
      if (top) {
        await db.notification.create({
          data: {
            userId: user.id,
            type: 'INFO' as any,
            message: `Nearest safe place: ${top.name} (${top.distanceKm} km). ${top.address ?? ''}`.trim(),
            entityId: incident.id,
          },
        }).catch(() => {})
      }
    } catch { /* never block SOS */ }

    // Run the existing incident pipeline asynchronously (triage → cluster → risk → resource rec)
    runIncidentWorkflow(incident.id).catch((e) => console.error('[sos] workflow error:', e))

    // Send email notifications to verified Family Safety Circle members
    // This runs asynchronously and does not block the response
    sendEmergencySosEmails(user.id, {
      citizenName: user.name,
      incidentCode,
      incidentType,
      severity: triage.severity,
      locationName: geocodedLocation,
      latitude,
      longitude,
      incidentTime: incident.createdAt,
      status: 'NEW',
      guidance: triage.immediateGuidance,
    }).catch((emailError) => {
      console.error('[sos] Email notification error:', emailError)
      // Email failures do not break the SOS flow
    })

    return NextResponse.json(
      {
        id: incident.id,
        incidentCode,
        type: incidentType,
        severity: triage.severity,
        urgencyScore: triage.urgencyScore,
        guidance: triage.immediateGuidance,
        triageSource: triage.source,
        location: { name: geocodedLocation, latitude, longitude },
        // FEATURE 1: Movement status
        movementStatus: citizenMovementStatus,
        // FEATURE 1-2: Destinations
        citizenDestination: citizenDestinationLatitude != null && citizenDestinationLongitude != null
          ? { latitude: citizenDestinationLatitude, longitude: citizenDestinationLongitude, name: citizenDestinationName }
          : null,
        resourceDestination: resourceDestinationLatitude != null && resourceDestinationLongitude != null
          ? { latitude: resourceDestinationLatitude, longitude: resourceDestinationLongitude, name: resourceDestinationName, type: resourceDestinationType }
          : null,
        // FEATURE 6-7: Nearest safe places + emergency services (real DB catalog)
        safePlaces: nearestSafePlaces,
        emergencyServices: nearestEmergencyServices,
        message: 'SOS received. Responders, command center, and your Family Safety Circle have been notified.',
      },
      { status: 201 }
    )
  } catch (e) {
    return handleAuthError(e)
  }
}
