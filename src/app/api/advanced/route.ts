// Advanced AI command-center API (SIH upgrade).
// GET   /api/advanced?feature=<name>[&incidentId=...]  — feature data (RBAC-filtered)
// GET   /api/advanced                                  — aggregated overview
// POST  /api/advanced  { action, ...payload }          — run feature actions
// PATCH /api/advanced  { action, id, ...patch }         — update records

import { NextResponse } from 'next/server'
import { requireAuth, handleAuthError, roleAllows } from '@/lib/auth'
import {
  getAdvancedOverview, getDigitalTwin, refreshDemandForecasts, resolveResourceConflicts,
  detectCascades, generateSafeZones, planEvacuationCorridors, scanExpiry,
  createShipment, advanceShipment, recommendHospitals, createListing,
  analyzeEvidence, getExplanations, runLearningLoop, listLearningEntries,
  runWhatIf, listWhatIfRuns, getBlackout, setBlackout, getIncidentGraph, getResponderWorkload,
} from '@/lib/services/advanced-service'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const url = new URL(req.url)
    const feature = url.searchParams.get('feature')
    const incidentId = url.searchParams.get('incidentId') || undefined
    if (!feature) {
      if (!roleAllows('advanced:read', user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      return NextResponse.json(await getAdvancedOverview())
    }
    switch (feature) {
      case 'twin':
        if (!roleAllows('advanced:read', user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        return NextResponse.json(await getDigitalTwin(incidentId))
      case 'conflicts':
      case 'workload':
      case 'graph':
      case 'cascades':
        if (!roleAllows('advanced:read', user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        if (feature === 'workload') return NextResponse.json({ workload: await getResponderWorkload() })
        if (feature === 'graph') return NextResponse.json(await getIncidentGraph())
        if (feature === 'cascades') return NextResponse.json(await detectCascades())
        return NextResponse.json(await resolveResourceConflicts())
      case 'forecasts':
        if (!roleAllows('advanced:act', user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        return NextResponse.json({ forecasts: await refreshDemandForecasts() })
      case 'safe-zones':
        return NextResponse.json({ zones: await db.safeZone.findMany({ where: incidentId ? { incidentId } : {}, orderBy: { createdAt: 'desc' }, take: 50 }) })
      case 'corridors':
        return NextResponse.json({ corridors: await db.evacuationCorridor.findMany({ where: incidentId ? { incidentId } : {}, orderBy: { createdAt: 'desc' }, take: 50 }) })
      case 'expiry':
        if (!roleAllows('advanced:read', user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        return NextResponse.json({ lots: await scanExpiry() })
      case 'shipments':
        return NextResponse.json({ shipments: await db.shipment.findMany({ where: incidentId ? { incidentId } : {}, orderBy: { createdAt: 'desc' }, take: 50 }) })
      case 'missing-persons': {
        const rows = await db.missingPerson.findMany({
          where: incidentId ? { incidentId } : {},
          orderBy: { priorityScore: 'desc' }, take: 100,
          include: { incident: { select: { incidentCode: true } } },
        })
        const officer = roleAllows('advanced:act', user.role)
        return NextResponse.json({
          missingPersons: rows.map((m) => ({
            id: m.id, fullName: m.fullName, age: m.age, gender: m.gender, description: m.description,
            lastSeenLocation: m.lastSeenLocation, latitude: m.latitude, longitude: m.longitude,
            medicalNeeds: m.medicalNeeds, childOrElder: m.childOrElder, priorityScore: m.priorityScore,
            status: m.status, incidentCode: m.incident?.incidentCode ?? null, createdAt: m.createdAt,
            contact: officer ? { name: m.contactName, phone: m.contactPhone } : { masked: true },
          })),
        })
      }
      case 'hospitals':
        return NextResponse.json(incidentId ? await recommendHospitals(incidentId) : { ranked: await db.hospital.findMany({ orderBy: { name: 'asc' } }), note: 'Hospital capacity is DEMO data.' })
      case 'marketplace':
        return NextResponse.json({ listings: await db.marketplaceListing.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) })
      case 'blackout':
        return NextResponse.json({ blackout: await getBlackout() })
      case 'whatif':
        if (!roleAllows('advanced:act', user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        return NextResponse.json({ runs: await listWhatIfRuns() })
      case 'explain':
        if (!roleAllows('advanced:read', user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        if (!incidentId) return NextResponse.json({ error: 'incidentId required' }, { status: 400 })
        return NextResponse.json(await getExplanations(incidentId))
      case 'learning':
        return NextResponse.json({ entries: await listLearningEntries() })
      case 'insights': {
        if (!roleAllows('advanced:read', user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        const rows = await db.aiInsight.findMany({ where: incidentId ? { incidentId } : {}, orderBy: { createdAt: 'desc' }, take: 60, include: { incident: { select: { incidentCode: true } } } })
        return NextResponse.json({ insights: rows })
      }
      default:
        return NextResponse.json({ error: `Unknown feature: ${feature}` }, { status: 400 })
    }
  } catch (e) {
    return handleAuthError(e)
  }
}
export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    // Citizens may only report missing persons.
    if (user.role === 'CITIZEN') {
      if (action !== 'report-missing-person') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (!body.fullName || !body.lastSeenLocation) return NextResponse.json({ error: 'fullName and lastSeenLocation are required' }, { status: 400 })
      const { scoreMissingPerson } = await import('@/lib/services/advanced-service')
      const lastSeenAt = body.lastSeenAt ? new Date(body.lastSeenAt) : null
      const childOrElder = Boolean(body.childOrElder) || (body.age != null && (body.age <= 10 || body.age >= 70))
      const mp = await db.missingPerson.create({
        data: {
          fullName: String(body.fullName), age: body.age ?? null, gender: body.gender ?? null,
          description: body.description ?? null, lastSeenAt, lastSeenLocation: String(body.lastSeenLocation),
          latitude: body.latitude ?? null, longitude: body.longitude ?? null,
          contactName: user.name, contactPhone: body.contactPhone ?? null,
          medicalNeeds: Boolean(body.medicalNeeds), childOrElder,
          priorityScore: scoreMissingPerson({ age: body.age ?? null, medicalNeeds: Boolean(body.medicalNeeds), childOrElder, lastSeenAt }),
          reportedById: user.id, incidentId: body.incidentId ?? null,
        },
      })
      return NextResponse.json({ missingPerson: { id: mp.id, priorityScore: mp.priorityScore }, ok: true })
    }
    if (!roleAllows('advanced:act', user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    switch (action) {
      case 'generate-safe-zones':
        if (!body.incidentId) return NextResponse.json({ error: 'incidentId required' }, { status: 400 })
        return NextResponse.json({ zones: await generateSafeZones(body.incidentId, user.id) })
      case 'plan-corridors':
        if (!body.incidentId) return NextResponse.json({ error: 'incidentId required' }, { status: 400 })
        return NextResponse.json({ corridors: await planEvacuationCorridors(body.incidentId, user.id) })
      case 'run-cascade-detection':
        return NextResponse.json(await detectCascades())
      case 'resolve-conflicts':
        return NextResponse.json(await resolveResourceConflicts())
      case 'scan-expiry':
        return NextResponse.json({ lots: await scanExpiry() })
      case 'create-shipment':
        if (!body.description || !body.origin || !body.destination) return NextResponse.json({ error: 'description, origin, destination required' }, { status: 400 })
        return NextResponse.json({ shipment: await createShipment({ description: body.description, origin: body.origin, destination: body.destination, incidentId: body.incidentId }, user.id) })
      case 'advance-shipment':
        if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
        return NextResponse.json({ shipment: await advanceShipment(body.id) })
      case 'create-listing':
        if (!body.agencyName || !body.resourceType || !body.quantity) return NextResponse.json({ error: 'agencyName, resourceType, quantity required' }, { status: 400 })
        return NextResponse.json(await createListing(body, user.id))
      case 'analyze-evidence':
        if (!body.incidentId) return NextResponse.json({ error: 'incidentId required' }, { status: 400 })
        return NextResponse.json(await analyzeEvidence(body.incidentId, body.modality === 'SATELLITE' ? 'SATELLITE' : 'DRONE'))
      case 'run-whatif':
        if (!body.scenario) return NextResponse.json({ error: 'scenario required' }, { status: 400 })
        return NextResponse.json(await runWhatIf(body, user.id))
      case 'set-blackout': {
        const b = await setBlackout({
          active: Boolean(body.active), mode: body.mode, reason: body.reason,
          affectedRegions: Array.isArray(body.affectedRegions) ? body.affectedRegions : undefined,
          endsAt: body.endsAt,
        }, user.id)
        return NextResponse.json({ blackout: b })
      }
      case 'run-learning-loop':
        return NextResponse.json(await runLearningLoop(user.id))
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAuth()
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    if (!roleAllows('advanced:act', user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (action === 'update-missing-person') {
      if (!body.id || !body.status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })
      const updated = await db.missingPerson.update({ where: { id: body.id }, data: { status: String(body.status), foundAt: ['FOUND', 'REUNITED'].includes(body.status) ? new Date() : null } })
      return NextResponse.json({ missingPerson: updated })
    }
    if (action === 'acknowledge-insight') {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const updated = await db.aiInsight.update({ where: { id: body.id }, data: { status: 'ACKNOWLEDGED' } })
      return NextResponse.json({ insight: updated })
    }
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return handleAuthError(e)
  }
}
