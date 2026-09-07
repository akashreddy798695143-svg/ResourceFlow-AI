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

    // 1. AI triage (Gemini with rule-based demo fallback)
    const triage = await triageSos(description, language)
    const incidentType = (['FLOOD','CYCLONE','EARTHQUAKE','LANDSLIDE','ROAD_BLOCKAGE','FIRE','MEDICAL','INFRASTRUCTURE','BUILDING_COLLAPSE','FOREST_FIRE','HEAVY_RAINFALL','INDUSTRIAL_ACCIDENT','OTHER'].includes(triage.incidentType)
      ? triage.incidentType
      : 'OTHER') as IncidentType

    // 2. Location validation + reverse geocode (best-effort)
    let locationName = String(body.location || '').slice(0, 300)
    if (!locationName) {
      try {
        const res = await fetch(`${new URL(req.url).origin}/api/geocode/reverse?lat=${latitude}&lng=${longitude}`, { headers: { cookie: req.headers.get('cookie') || '' } })
        if (res.ok) {
          const j = await res.json()
          locationName = String(j.shortName || j.name || '')
        }
      } catch { /* demo fallback: keep empty */ }
    }
    if (!locationName) locationName = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`

    const year = new Date().getFullYear()
    const count = await db.incident.count()
    const incidentCode = `RF-${year}-${String(count + 1).padStart(6, '0')}`

    const incident = await db.incident.create({
      data: {
        incidentCode,
        type: incidentType,
        description,
        location: locationName,
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
      },
    })

    await recordIncidentEvent(incident.id, 'SOS_ONE_TAP', {
      label: `One-tap SOS ${incidentCode} — triaged ${triage.severity} (score ${triage.urgencyScore})`,
      code: incidentCode,
      severity: triage.severity,
      urgencyScore: triage.urgencyScore,
      triageSource: triage.source,
      guidance: triage.immediateGuidance,
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

    // Run the existing incident pipeline asynchronously (triage → cluster → risk → resource rec)
    runIncidentWorkflow(incident.id).catch((e) => console.error('[sos] workflow error:', e))

    // Send email notifications to verified Family Safety Circle members
    // This runs asynchronously and does not block the response
    sendEmergencySosEmails(user.id, {
      citizenName: user.name,
      incidentCode,
      incidentType,
      severity: triage.severity,
      locationName,
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
        location: { name: locationName, latitude, longitude },
        message: 'SOS received. Responders, command center, and your Family Safety Circle have been notified.',
      },
      { status: 201 }
    )
  } catch (e) {
    return handleAuthError(e)
  }
}
