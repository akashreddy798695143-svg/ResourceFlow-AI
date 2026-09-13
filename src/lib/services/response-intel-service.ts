// AI RESPONSE INTELLIGENCE service — the 10 game-changer features.
//
// Design rules (strictly followed):
//  • Reuse existing Prisma models — NO duplicate models.
//    - Persisted AI outputs -> AiInsight (feature + payload Json)
//    - Approval lifecycle   -> Approval (decision PENDING/APPROVED/REJECTED)
//    - Notifications        -> pushNotification() (existing system)
//  • REAL DB data first. Gemini augments narrative only.
//  • Data genuinely unavailable -> { available: false, ... } NEVER fabricated.
//  • Failure-safe: no function throws into a route.
//
import { db } from '@/lib/db'
import { askAI } from '@/lib/ai-client'
import { haversineKm, estimateEtaMinutes } from '@/lib/agents/resource-agent'
import { pushNotification } from '@/lib/notifications'
import { recordIncidentEvent } from '@/lib/events'
import { buildRouteForAssignment } from '@/lib/features/rescue-route'
import type { Resource, RiskLevel } from '@prisma/client'

type Json = any

const ASSIGNMENT_INCLUDE = { where: { replacedAt: null }, include: { Resource: true } as const }

function levelFor(score: number): RiskLevel { return score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW' }
function nowIso() { return new Date().toISOString() }
function humanizeEnum(s: string) { return s.split('_').join(' ') }

async function saveInsight(params: {
  incidentId?: string | null
  feature: string
  severity: RiskLevel
  confidence?: number
  payload: Json
  source?: string
  createdById?: string | null
}) {
  try {
    return await db.aiInsight.create({
      data: {
        incidentId: params.incidentId ?? null,
        feature: params.feature,
        severity: params.severity,
        confidence: params.confidence ?? null,
        payload: params.payload as any,
        source: params.source ?? 'deterministic',
        demo: false,
        createdById: params.createdById ?? null,
      },
    })
  } catch (e) {
    console.error('[response-intel] persist ' + params.feature + ' failed:', e)
    return null
  }
}

async function tryAI<T>(fn: () => Promise<any>, parse: (c: string) => T | null): Promise<T | null> {
  if (!process.env.GEMINI_API_KEY) return null
  try {
    const res = await fn()
    if (!res?.ok || !res?.content) return null
    return parse(res.content)
  } catch { return null }
}

// Recommended resource type matrix per incident type (deterministic policy).
const NEED_MATRIX: Record<string, string[]> = {
  FLOOD: ['RESCUE_TEAM', 'WATER_SUPPLY', 'FOOD_SUPPLY', 'AMBULANCE'],
  CYCLONE: ['RESCUE_TEAM', 'FOOD_SUPPLY', 'MEDICAL_SUPPLY', 'WATER_SUPPLY'],
  EARTHQUAKE: ['RESCUE_TEAM', 'MEDICAL_SUPPLY', 'AMBULANCE'],
  LANDSLIDE: ['RESCUE_TEAM', 'AMBULANCE', 'EMERGENCY_VEHICLE'],
  FIRE: ['FIRE_TEAM', 'AMBULANCE'],
  FOREST_FIRE: ['FIRE_TEAM', 'WATER_SUPPLY'],
  BUILDING_COLLAPSE: ['RESCUE_TEAM', 'MEDICAL_SUPPLY', 'AMBULANCE'],
  MEDICAL: ['AMBULANCE', 'MEDICAL_SUPPLY'],
  HEAVY_RAINFALL: ['RESCUE_TEAM', 'WATER_SUPPLY'],
  ROAD_BLOCKAGE: ['EMERGENCY_VEHICLE'],
  INDUSTRIAL_ACCIDENT: ['FIRE_TEAM', 'MEDICAL_SUPPLY', 'AMBULANCE'],
  INFRASTRUCTURE: ['EMERGENCY_VEHICLE'],
  OTHER: ['RESCUE_TEAM'],
}

// ─── FEATURE 1 — AI RESPONSE MISSION PLANNER ────────────────────────────────
export interface MissionPlan {
  available: boolean
  dataUnavailableReason?: string
  incidentId: string
  incidentCode: string
  generatedAt: string
  source: 'ai' | 'deterministic'
  insightId?: string | null
  approvalId?: string | null
  approvalDecision?: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  plan: {
    immediateAction: string
    rescuePriority: string
    requiredResources: string[]
    recommendedTeam: string
    recommendedRoute: string
    safetyPrecautions: string[]
    communicationRequirements: string[]
    escalationCondition: string
  }
  context: {
    type: string
    riskLevel: string | null
    riskScore: number | null
    peopleAffected: number | null
    roadBlocked: boolean | null
    weather: Json
    availableResourceTypes: Record<string, number>
    nearbyServiceCount: number
    activeAssignmentCount: number
  }
}

export async function generateMissionPlan(incidentId: string, userId?: string): Promise<MissionPlan> {
  const unavailable = (reason: string): MissionPlan => ({
    available: false,
    dataUnavailableReason: reason,
    incidentId,
    incidentCode: '',
    generatedAt: nowIso(),
    source: 'deterministic',
    plan: {
      immediateAction: 'DATA UNAVAILABLE', rescuePriority: 'DATA UNAVAILABLE', requiredResources: [],
      recommendedTeam: 'DATA UNAVAILABLE', recommendedRoute: 'DATA UNAVAILABLE',
      safetyPrecautions: [], communicationRequirements: [], escalationCondition: 'DATA UNAVAILABLE',
    },
    context: {
      type: '', riskLevel: null, riskScore: null, peopleAffected: null, roadBlocked: null, weather: null,
      availableResourceTypes: {}, nearbyServiceCount: 0, activeAssignmentCount: 0,
    },
  })

  try {
    const incident = await db.incident.findUnique({
      where: { id: incidentId },
      include: { ResourceAssignment: ASSIGNMENT_INCLUDE },
    })
    if (!incident) return unavailable('incident_not_found')

    const [resources, serviceCount, safePlaceCount] = await Promise.all([
      db.resource.findMany(),
      db.emergencyService.count({ where: { incidentId } }),
      db.safePlace.count({ where: { incidentId } }),
    ])

    const availableResourceTypes: Record<string, number> = {}
    for (const r of resources) {
      if (r.status === 'AVAILABLE') availableResourceTypes[r.type] = (availableResourceTypes[r.type] || 0) + 1
    }

    const activeAssignmentCount = incident.ResourceAssignment.length
    const riskScore = incident.riskScore ?? 0
    const people = incident.aiPeopleAffected ?? null
    let weather: Json = null
    try { weather = incident.weather ? JSON.parse(incident.weather) : null } catch { weather = null }

    const needTypes = NEED_MATRIX[incident.type] || NEED_MATRIX.OTHER
    const requiredResources: string[] = []
    for (const t of needTypes) {
      const have = availableResourceTypes[t] || 0
      const need = t === 'AMBULANCE' && (people ?? 0) > 50 ? 2 : 1
      requiredResources.push(humanizeEnum(t) + ' x ' + need + ' (available: ' + have + ')')
    }

    const teamMap: Record<string, string> = {
      FLOOD: 'Swift-water rescue team + medical support', CYCLONE: 'Urban search & rescue + relief logistics',
      EARTHQUAKE: 'USAR team with medical triage', LANDSLIDE: 'Heavy rescue team + emergency vehicle',
      FIRE: 'Fire suppression crew + ambulance standby', FOREST_FIRE: 'Wildland fire crew + water tankers',
      BUILDING_COLLAPSE: 'USAR + medical triage', MEDICAL: 'Paramedic unit',
      HEAVY_RAINFALL: 'Rescue team + drainage crew', ROAD_BLOCKAGE: 'Traffic / clearance unit',
      INDUSTRIAL_ACCIDENT: 'HAZMAT fire crew + medical decontamination', INFRASTRUCTURE: 'Utility repair team',
      OTHER: 'General rescue team',
    }

    const immediateMap: Record<string, string> = {
      CRITICAL: 'Deploy first-response team immediately. Confirm life-safety situation on scene and establish command.',
      HIGH: 'Dispatch primary resource now. Verify access route and set up casualty reception point.',
      MEDIUM: 'Dispatch nearest suitable resource. Monitor for escalation and confirm scene conditions.',
      LOW: 'Acknowledge and stage nearest resource. Verify the report with an on-site assessment.',
    }

    const safety: string[] = []
    if (incident.aiRoadBlocked) safety.push('Road blockage reported — approach from an alternate access road.')
    if (incident.type === 'FLOOD' || incident.type === 'CYCLONE' || incident.type === 'HEAVY_RAINFALL') safety.push('Never attempt water crossing on foot or in a light vehicle.')
    if (incident.type === 'FIRE' || incident.type === 'FOREST_FIRE') safety.push('Maintain upwind approach; monitor smoke direction.')
    if (incident.type === 'EARTHQUAKE' || incident.type === 'BUILDING_COLLAPSE') safety.push('Expect aftershocks — no entry into unstable structures.')
    if (incident.type === 'INDUSTRIAL_ACCIDENT') safety.push('Maintain HAZMAT perimeter; use appropriate PPE.')
    if (safety.length === 0) safety.push('Standard scene safety: wear PPE and maintain radio contact.')

    const comms: string[] = ['Incident command channel: confirm en-route and on-scene.']
    if (riskScore >= 80) comms.push('Escalate to district emergency operations center.')
    if (people && people > 100) comms.push('Request mass-casualty coordination channel.')
    comms.push('Notify on-scene commander of any change to the situation.')

    const riskLabel = levelFor(riskScore)
    const plan = {
      immediateAction: immediateMap[riskLabel] || immediateMap.LOW,
      rescuePriority: people && people > 50
        ? 'Mass-casualty priority — approx. ' + people + ' people affected.'
        : activeAssignmentCount > 0
          ? activeAssignmentCount + ' resource(s) already assigned — coordinate arrival and re-triage on scene.'
          : 'Single-unit response priority until on-scene assessment confirms otherwise.',
      requiredResources,
      recommendedTeam: teamMap[incident.type] || teamMap.OTHER,
      recommendedRoute: incident.aiRoadBlocked
        ? 'Primary road flagged as blocked — use a Dynamic Rescue Corridor alternative.'
        : 'Approach via the shortest road route; verify accessibility on arrival.',
      safetyPrecautions: safety,
      communicationRequirements: comms,
      escalationCondition: riskScore >= 80
        ? 'Escalate if casualties exceed 10 OR a secondary hazard (fire, collapse, contamination) is confirmed.'
        : riskScore >= 60
          ? 'Escalate if the scene is inaccessible for more than 15 minutes OR casualties increase.'
          : 'Escalate if the situation worsens or additional incidents are reported in the same area.',
    }

    let source: 'ai' | 'deterministic' = 'deterministic'
    const aiNarrative = await tryAI(
      () => askAI(
        'You are a disaster response planning. Given incident facts and a deterministic plan, refine into an ordered operational plan. Plain text, no markdown.',
        'Incident ' + incident.incidentCode + ' type=' + incident.type + ' risk=' + riskLabel + ' people=' + (people ?? 'unknown') + ' roadBlocked=' + Boolean(incident.aiRoadBlocked) + ' assignments=' + activeAssignmentCount + ' plan=' + JSON.stringify(plan),
      ),
      (c) => c,
    )
    if (aiNarrative) source = 'ai'

    const insight = await saveInsight({
      incidentId,
      feature: 'MISSION_PLAN',
      severity: riskLabel,
      confidence: 0.7,
      source,
      payload: { plan, context: { type: incident.type, riskScore, people, activeAssignmentCount }, narrative: aiNarrative ?? null },
      createdById: userId ?? null,
    })

    let approvalId: string | null = null
    let approvalDecision: MissionPlan['approvalDecision'] = null
    const existingApproval = await db.approval.findFirst({
      where: { incidentId, recommendation: { contains: 'MISSION_PLAN' } },
      orderBy: { createdAt: 'desc' },
    })
    if (existingApproval) {
      approvalId = existingApproval.id
      approvalDecision = existingApproval.decision
    } else {
      const created = await db.approval.create({
        data: {
          incidentId,
          recommendation: JSON.stringify({ kind: 'MISSION_PLAN', insightId: insight?.id ?? null, plan }),
          decision: 'PENDING',
        },
      })
      approvalId = created.id
      approvalDecision = 'PENDING'
      await recordIncidentEvent(incidentId, 'MISSION_PLAN_GENERATED', { label: 'Mission plan generated (' + source + ')' })
      await pushNotification({
        type: 'APPROVAL_REQUIRED',
        message: 'Mission plan awaiting approval for ' + incident.incidentCode,
        entityId: incidentId,
      }).catch(() => {})
    }

    return {
      available: true,
      incidentId,
      incidentCode: incident.incidentCode,
      generatedAt: nowIso(),
      source,
      insightId: insight?.id ?? null,
      approvalId,
      approvalDecision,
      plan,
      context: {
        type: incident.type,
        riskLevel: riskLabel,
        riskScore,
        peopleAffected: people,
        roadBlocked: incident.aiRoadBlocked ?? null,
        weather,
        availableResourceTypes,
        nearbyServiceCount: serviceCount + safePlaceCount,
        activeAssignmentCount,
      },
    }
  } catch (e) {
    console.error('[mission-planner] error:', e)
    return unavailable('database_unavailable')
  }
}

export async function getLatestMissionPlan(incidentId: string) {
  try {
    const insight = await db.aiInsight.findFirst({
      where: { incidentId, feature: 'MISSION_PLAN' },
      orderBy: { createdAt: 'desc' },
    })
    if (!insight) return null
    const approval = await db.approval.findFirst({
      where: { incidentId, recommendation: { contains: 'MISSION_PLAN' } },
      orderBy: { createdAt: 'desc' },
    })
    return { insight, approval }
  } catch { return null }
}

// ─── FEATURE 2 — DYNAMIC RESCUE CORRIDOR ────────────────────
export interface RescueCorridor {
  available: boolean
  dataUnavailableReason?: string
  incidentId: string
  incidentCode: string
  generatedAt: string
  routes: Array<{
    label: 'SAFE_ROUTE' | 'ALTERNATIVE_ROUTE' | 'BLOCKED_ROUTE'
    status: 'SAFE' | 'ALTERNATIVE' | 'BLOCKED'
    description: string
    distanceKm: number | null
    etaMinutes: number | null
    reasons: string[]
    from?: { lat: number; lng: number }
    to?: { lat: number; lng: number }
  }>
  recommended: 'SAFE_ROUTE' | 'ALTERNATIVE_ROUTE' | 'BLOCKED_ROUTE' | null
  responderActions: string[]
  navigationAvailable: boolean
}

export async function buildRescueCorridor(incidentId: string, resourceId?: string): Promise<RescueCorridor> {
  const empty = (reason: string): RescueCorridor => ({
    available: false, dataUnavailableReason: reason, incidentId, incidentCode: '',
    generatedAt: nowIso(), routes: [], recommended: null, responderActions: [], navigationAvailable: false,
  })
  try {
    const incident = await db.incident.findUnique({
      where: { id: incidentId },
      include: { ResourceAssignment: ASSIGNMENT_INCLUDE },
    })
    if (!incident) return empty('incident_not_found')

    const assignedResource = resourceId
      ? incident.ResourceAssignment.find((a) => a.resourceId === resourceId)?.Resource ?? null
      : incident.ResourceAssignment[0]?.Resource ?? null

    const routes: RescueCorridor['routes'] = []
    const roadBlocked = Boolean(incident.aiRoadBlocked)
    const disasterZone = ['LANDSLIDE', 'FLOOD', 'EARTHQUAKE', 'CYCLONE', 'HEAVY_RAINFALL', 'FOREST_FIRE'].includes(incident.type)

    if (assignedResource) {
      const r = await buildRouteForAssignment({ resourceId: assignedResource.id, incidentId })
      if (r.available && r.routeStatus !== 'NO_DATA') {
        const blocked = r.routeStatus === 'ROUTE_RISK_DETECTED' && r.risks.some((x) => /road-blockage|blocked|unavailable/i.test(x))
        routes.push({
          label: blocked ? 'BLOCKED_ROUTE' : 'SAFE_ROUTE',
          status: blocked ? 'BLOCKED' : 'SAFE',
          description: blocked
            ? 'Primary corridor from ' + assignedResource.resourceCode + ' to ' + incident.incidentCode + ' flagged as blocked.'
            : 'Primary corridor from ' + assignedResource.resourceCode + ' to ' + incident.incidentCode + '.',
          distanceKm: r.distanceKm,
          etaMinutes: r.etaMinutes,
          reasons: r.risks.length ? r.risks : ['No DB-recorded obstruction on the primary corridor.'],
          from: { lat: r.currentLocation.lat, lng: r.currentLocation.lng },
          to: { lat: r.destination.lat, lng: r.destination.lng },
        })
      }
    } else {
      routes.push({
        label: 'SAFE_ROUTE',
        status: roadBlocked ? 'BLOCKED' : 'SAFE',
        description: 'Corridor reference computed from incident coordinates (no resource assigned yet).',
        distanceKm: null,
        etaMinutes: null,
        reasons: roadBlocked ? ['Road-blockage flag set on the incident.'] : ['Awaiting resource assignment.'],
        to: { lat: incident.latitude, lng: incident.longitude },
      })
    }

    if (assignedResource) {
      const alts = await db.resource.findMany({
        where: { status: 'AVAILABLE', type: assignedResource.type, id: { not: assignedResource.id } },
        take: 30,
      })
      let best: Resource | null = null
      let bestKm = Infinity
      for (const a of alts) {
        const d = haversineKm(a.latitude, a.longitude, incident.latitude, incident.longitude)
        if (d < bestKm) { bestKm = d; best = a }
      }
      if (best) {
        routes.push({
          label: 'ALTERNATIVE_ROUTE',
          status: 'ALTERNATIVE',
          description: 'Alternative corridor via ' + best.resourceCode + ' (' + best.name + ').',
          distanceKm: Number(bestKm.toFixed(2)),
          etaMinutes: estimateEtaMinutes(bestKm, false),
          reasons: ['Same-type resource available in the database at this distance.'],
          from: { lat: best.latitude, lng: best.longitude },
          to: { lat: incident.latitude, lng: incident.longitude },
        })
      }
    }

    if (roadBlocked && !routes.some((r) => r.status === 'BLOCKED')) {
      routes.push({
        label: 'BLOCKED_ROUTE',
        status: 'BLOCKED',
        description: 'Primary access road is flagged as blocked in the incident record.',
        distanceKm: null,
        etaMinutes: null,
        reasons: ['Incident road-blockage flag is TRUE in the database.'],
        to: { lat: incident.latitude, lng: incident.longitude },
      })
    }
    if (disasterZone && !routes.some((r) => r.label === 'ALTERNATIVE_ROUTE')) {
      routes.push({
        label: 'ALTERNATIVE_ROUTE',
        status: 'ALTERNATIVE',
        description: incident.type + ' zone — plan a bypass corridor if the primary road degrades.',
        distanceKm: null,
        etaMinutes: null,
        reasons: ['Route may traverse a known disaster zone for this incident type.'],
        to: { lat: incident.latitude, lng: incident.longitude },
      })
    }

    const safe = routes.find((r) => r.status === 'SAFE')
    const recommended: RescueCorridor['recommended'] =
      safe ? 'SAFE_ROUTE' : routes.some((r) => r.status === 'ALTERNATIVE') ? 'ALTERNATIVE_ROUTE' : routes.some((r) => r.status === 'BLOCKED') ? 'BLOCKED_ROUTE' : null

    await saveInsight({
      incidentId, feature: 'RESCUE_CORRIDOR', severity: recommended === 'BLOCKED_ROUTE' ? 'HIGH' : 'MEDIUM',
      confidence: 0.65, payload: { routes, recommended }, source: 'deterministic',
    })

    return {
      available: true,
      incidentId,
      incidentCode: incident.incidentCode,
      generatedAt: nowIso(),
      routes,
      recommended,
      responderActions: ['NAVIGATE', 'GO LIVE'],
      navigationAvailable: routes.length > 0,
    }
  } catch (e) {
    console.error('[rescue-corridor] error:', e)
    return empty('database_unavailable')
  }
}

// ─── FEATURE 3 — DISASTER DIGITAL TWIN (scoped simulation) ──────────────────
export async function getDisasterTwin(incidentId?: string) {
  try {
    const inc = incidentId
      ? await db.incident.findUnique({
          where: { id: incidentId },
          include: {
            ResourceAssignment: ASSIGNMENT_INCLUDE,
            IncidentEvent: { orderBy: { createdAt: 'asc' }, take: 30 },
          },
        })
      : null
    const [resources, safePlaces, services, hazards] = await Promise.all([
      db.resource.findMany({ take: 100 }),
      db.safePlace.findMany({ where: incidentId ? { incidentId } : {}, take: 20 }),
      db.emergencyService.findMany({ where: incidentId ? { incidentId } : {}, take: 20 }),
      db.hazardReport.findMany({ take: 30, orderBy: { createdAt: 'desc' } }),
    ])
    const zones = incidentId
      ? { impactZone1Km: inc?.impactZone1Km ?? null, impactZone5Km: inc?.impactZone5Km ?? null, impactZone10Km: inc?.impactZone10Km ?? null }
      : null
    return {
      available: true,
      scope: inc
        ? { id: inc.id, code: inc.incidentCode, type: inc.type, status: inc.status, location: inc.location, lat: inc.latitude, lng: inc.longitude, riskLevel: inc.riskLevel }
        : { scope: 'GLOBAL' },
      impactZones: zones,
      roads: { primaryBlocked: inc?.aiRoadBlocked ?? null, note: 'Road state mirrors the incident + hazard records only.' },
      resources: resources.map((r) => ({ code: r.resourceCode, type: r.type, status: r.status, lat: r.latitude, lng: r.longitude })),
      safePlaces: safePlaces.map((p) => ({ name: p.name, type: p.type, availability: p.availability, lat: p.latitude, lng: p.longitude })),
      services: services.map((s) => ({ name: s.name, type: s.type, availability: s.availability, lat: s.latitude, lng: s.longitude })),
      hazards: hazards.map((h) => ({ id: h.id, type: h.hazardType, severity: h.severity, lat: h.latitude, lng: h.longitude, status: h.status })),
      note: 'Decision-support mirror of platform state. It is NOT a guaranteed real-world prediction.',
    }
  } catch (e) {
    console.error('[disaster-twin] error:', e)
    return { available: false, dataUnavailableReason: 'database_unavailable', scope: incidentId ? { id: incidentId } : { scope: 'GLOBAL' } }
  }
}

export async function simulateTwinScenario(params: {
  incidentId?: string
  scenario: 'ROAD_BLOCKED' | 'RESOURCE_UNAVAILABLE' | 'NEW_INCIDENT_NEARBY'
  resourceCode?: string
}, userId?: string) {
  try {
    const incident = params.incidentId
      ? await db.incident.findUnique({
          where: { id: params.incidentId },
          include: { ResourceAssignment: ASSIGNMENT_INCLUDE },
        })
      : null
    const base = {
      scenario: params.scenario,
      disclaimer: 'Predicted operational impact from current platform data — NOT a guaranteed outcome.',
    }
    if (params.scenario === 'ROAD_BLOCKED') {
      const impacts: string[] = ['Primary corridor becomes unusable for the assigned resource.']
      let altFound = false
      if (incident) {
        const assigned = incident.ResourceAssignment[0]?.Resource
        if (assigned) {
          const alts = await db.resource.findMany({ where: { status: 'AVAILABLE', type: assigned.type, id: { not: assigned.id } }, take: 5 })
          altFound = alts.length > 0
        }
      }
      impacts.push(altFound ? 'A same-type alternative resource exists and could be redirected.' : 'No same-type alternative available — mutual-aid escalation required.')
      impacts.push('Expect increased ETA on the affected assignment.')
      await saveInsight({ incidentId: params.incidentId ?? null, feature: 'TWIN_SIM', severity: 'HIGH', confidence: 0.6, payload: { ...base, impacts }, createdById: userId })
      return { ...base, predictedOperationalImpact: impacts, recommendedChanges: ['Re-route via alternative corridor', 'Notify officer to approve a resource swap if delays exceed the threshold'] }
    }
    if (params.scenario === 'RESOURCE_UNAVAILABLE') {
      const target = params.resourceCode
        ? await db.resource.findUnique({ where: { resourceCode: params.resourceCode } })
        : incident?.ResourceAssignment[0]?.Resource ?? null
      if (!target) return { ...base, predictedOperationalImpact: ['Resource unspecified — cannot compute impact.'], recommendedChanges: [] }
      const impacts = [
        'Resource ' + target.resourceCode + ' (' + target.type + ') would be removed from service.',
      ]
      const replacements = await db.resource.findMany({ where: { status: 'AVAILABLE', type: target.type, id: { not: target.id } }, take: 5 })
      impacts.push(replacements.length ? replacements.length + ' same-type replacement(s) available.' : 'No replacement currently available — coverage gap.')
      await saveInsight({ incidentId: params.incidentId ?? null, feature: 'TWIN_SIM', severity: 'HIGH', confidence: 0.6, payload: { ...base, impacts }, createdById: userId })
      return {
        ...base,
        predictedOperationalImpact: impacts,
        recommendedChanges: replacements.length ? ['Trigger Resource Swap Engine for the affected assignment'] : ['Escalate to mutual aid'],
      }
    }
    const nearby = incident
      ? await db.incident.findMany({ where: { id: { not: incident.id }, status: { notIn: ['RESOLVED', 'CLOSED'] } }, take: 50 })
      : []
    const close = incident
      ? nearby.filter((i) => haversineKm(i.latitude, i.longitude, incident.latitude, incident.longitude) <= 5)
      : []
    const impacts = [
      incident ? 'Within 5 km of ' + incident.incidentCode + ', ' + close.length + ' other active incident(s) already exist.' : 'No reference incident selected.',
      'A new nearby incident would compete for the same locally available resources.',
      'If both incidents are HIGH/CRITICAL, a resource shortage is likely.',
    ]
    await saveInsight({ incidentId: params.incidentId ?? null, feature: 'TWIN_SIM', severity: 'MEDIUM', confidence: 0.55, payload: { ...base, impacts }, createdById: userId })
    return { ...base, predictedOperationalImpact: impacts, recommendedChanges: ['Pre-position a spare unit in the vicinity', 'Stage a relief resource list for the district'] }
  } catch (e) {
    console.error('[twin-sim] error:', e)
    return { available: false, dataUnavailableReason: 'database_unavailable', scenario: params.scenario }
  }
}

// ─── FEATURE 5 — AI RESOURCE SWAP ENGINE ────────────────────
export interface SwapRecommendation {
  available: boolean
  dataUnavailableReason?: string
  incidentId: string
  incidentCode: string
  currentResource: { id: string; code: string; name: string; type: string; status: string } | null
  problem: string
  recommendedReplacement: {
    id: string; code: string; name: string; type: string; status: string; capacity: number
    distanceKm: number | null; estimatedArrivalMinutes: number | null
  } | null
  reason: string
  approvalId?: string | null
  requiresApproval: boolean
}

export async function recommendResourceSwap(incidentId: string, userId?: string): Promise<SwapRecommendation> {
  const empty = (reason: string): SwapRecommendation => ({
    available: false, dataUnavailableReason: reason, incidentId, incidentCode: '',
    currentResource: null, problem: '', recommendedReplacement: null, reason: '', requiresApproval: true,
  })
  try {
    const incident = await db.incident.findUnique({
      where: { id: incidentId },
      include: { ResourceAssignment: ASSIGNMENT_INCLUDE },
    })
    if (!incident) return empty('incident_not_found')

    const current = incident.ResourceAssignment[0]?.Resource ?? null
    if (!current) {
      return {
        available: true, incidentId, incidentCode: incident.incidentCode, currentResource: null,
        problem: 'no resource currently assigned', recommendedReplacement: null,
        reason: 'Assign a resource first — the swap engine operates on an existing assignment.',
        requiresApproval: false,
      }
    }

    const problemParts: string[] = []
    if (current.status === 'UNAVAILABLE') problemParts.push('assigned resource is marked UNAVAILABLE')
    if (incident.status === 'DELAYED') problemParts.push('incident is flagged DELAYED')
    if (current.eta != null && current.eta > 45) problemParts.push('reported ETA ' + current.eta + ' min exceeds the operational threshold')
    const problem = problemParts.length ? problemParts.join('; ') : 'no active problem detected for the current assignment'

    const candidates = await db.resource.findMany({
      where: { status: 'AVAILABLE', type: current.type, id: { not: current.id } },
      take: 40,
    })
    let best: Resource | null = null
    let bestKm = Infinity
    for (const c of candidates) {
      const d = haversineKm(c.latitude, c.longitude, incident.latitude, incident.longitude)
      if (d < bestKm) { bestKm = d; best = c }
    }

    const recommendedReplacement = best
      ? {
          id: best.id, code: best.resourceCode, name: best.name, type: best.type, status: best.status, capacity: best.capacity,
          distanceKm: Number(bestKm.toFixed(2)),
          estimatedArrivalMinutes: estimateEtaMinutes(bestKm, Boolean(incident.aiRoadBlocked)),
        }
      : null

    let approvalId: string | null = null
    if (recommendedReplacement && problemParts.length > 0) {
      const existing = await db.approval.findFirst({ where: { incidentId, recommendation: { contains: 'RESOURCE_SWAP' }, decision: 'PENDING' } })
      if (!existing) {
        const created = await db.approval.create({
          data: {
            incidentId,
            resourceId: current.id,
            recommendation: JSON.stringify({ kind: 'RESOURCE_SWAP', fromResourceId: current.id, toResourceId: best!.id, reason: problem }),
            decision: 'PENDING',
          },
        })
        approvalId = created.id
        await pushNotification({ type: 'APPROVAL_REQUIRED', message: 'Resource swap awaiting approval for ' + incident.incidentCode, entityId: incidentId }).catch(() => {})
        await recordIncidentEvent(incidentId, 'RESOURCE_SWAP_RECOMMENDED', { label: 'Swap recommended: ' + current.resourceCode + ' to ' + best!.resourceCode })
      } else {
        approvalId = existing.id
      }
    }

    await saveInsight({
      incidentId, feature: 'RESOURCE_SWAP', severity: problemParts.length ? 'HIGH' : 'LOW', confidence: 0.7,
      payload: { current: current.resourceCode, replacement: best?.resourceCode ?? null, problem, reason: recommendedReplacement ? 'Closest same-type AVAILABLE resource at ' + bestKm.toFixed(1) + ' km.' : 'No same-type AVAILABLE resource in the database.', approvalId },
      createdById: userId,
    })

    return {
      available: true,
      incidentId,
      incidentCode: incident.incidentCode,
      currentResource: { id: current.id, code: current.resourceCode, name: current.name, type: current.type, status: current.status },
      problem,
      recommendedReplacement,
      reason: recommendedReplacement
        ? 'Closest same-type AVAILABLE resource (' + best!.capacity + ' capacity) at ' + bestKm.toFixed(1) + ' km.'
        : 'No same-type AVAILABLE resource exists in the database — mutual-aid escalation required.',
      approvalId,
      requiresApproval: true,
    }
  } catch (e) {
    console.error('[resource-swap] error:', e)
    return empty('database_unavailable')
  }
}

// ─── FEATURE 8 — RESCUE ETA RISK PREDICTOR ──────────────────
export interface EtaRisk {
  available: boolean
  dataUnavailableReason?: string
  resourceId?: string
  resourceCode?: string
  incidentId?: string
  etaMinutes: number | null
  etaRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
  routeStatus: 'OK' | 'ROUTE_RISK_DETECTED' | 'NO_DATA'
  delayReason: string | null
  lastLocationUpdate: string | null
  alternativeAction: string | null
  generatedAt: string
}

export async function predictEtaRisk(incidentId: string, resourceId: string): Promise<EtaRisk> {
  const empty = (reason: string): EtaRisk => ({ available: false, dataUnavailableReason: reason, etaMinutes: null, etaRisk: 'UNKNOWN', routeStatus: 'NO_DATA', delayReason: null, lastLocationUpdate: null, alternativeAction: null, generatedAt: nowIso() })
  try {
    const [incident, resource] = await Promise.all([
      db.incident.findUnique({ where: { id: incidentId } }),
      db.resource.findUnique({ where: { id: resourceId } }),
    ])
    if (!incident || !resource) return empty('not_found')

    const route = await buildRouteForAssignment({ resourceId, incidentId })
    const baseKm = haversineKm(resource.latitude, resource.longitude, incident.latitude, incident.longitude)
    const baseEta = estimateEtaMinutes(baseKm, Boolean(incident.aiRoadBlocked))

    const signals: string[] = []
    if (resource.status === 'UNAVAILABLE') signals.push('resource marked UNAVAILABLE')
    if (resource.status === 'ARRIVED' || resource.status === 'ON_SCENE') signals.push('resource is already on scene')
    if (incident.status === 'DELAYED') signals.push('incident flagged DELAYED')
    if (incident.aiRoadBlocked) signals.push('road blockage flagged on the incident')
    if (route.routeStatus === 'ROUTE_RISK_DETECTED') signals.push(...route.risks)
    const lastUpdate = resource.lastUpdated ? new Date(resource.lastUpdated) : null
    const minsSinceUpdate = lastUpdate ? (Date.now() - lastUpdate.getTime()) / 60000 : null
    if (minsSinceUpdate != null && minsSinceUpdate > 30) signals.push('no location update for ' + Math.round(minsSinceUpdate) + ' min')

    const riskScore =
      (signals.some((s) => /UNAVAILABLE|blockage|DELAYED/i.test(s)) ? 60 : 0) +
      (minsSinceUpdate != null && minsSinceUpdate > 30 ? 25 : 0) +
      (baseEta > 45 ? 15 : baseEta > 30 ? 8 : 0)
    const etaRisk: EtaRisk['etaRisk'] = riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW'

    const delayReason = signals.length ? signals.join('; ') : null
    let alternativeAction: string | null = null
    if (etaRisk !== 'LOW') {
      const swap = await recommendResourceSwap(incidentId)
      alternativeAction = swap.recommendedReplacement
        ? 'Consider swapping to ' + swap.recommendedReplacement.code + ' (ETA ~' + swap.recommendedReplacement.estimatedArrivalMinutes + ' min).'
        : 'No same-type alternative available — escalate to mutual aid or officer command.'
    }

    if (etaRisk === 'HIGH') {
      await pushNotification({ type: 'WARNING', message: 'HIGH ETA risk for ' + incident.incidentCode + ' (' + resource.resourceCode + '): ' + delayReason, entityId: incidentId }).catch(() => {})
    }

    await saveInsight({
      incidentId, feature: 'ETA_RISK', severity: etaRisk === 'HIGH' ? 'HIGH' : etaRisk === 'MEDIUM' ? 'MEDIUM' : 'LOW', confidence: 0.65,
      payload: { resourceId, etaMinutes: baseEta, etaRisk, signals, delayReason, alternativeAction, routeStatus: route.routeStatus },
    })

    return {
      available: true,
      resourceId,
      resourceCode: resource.resourceCode,
      incidentId,
      etaMinutes: baseEta,
      etaRisk,
      routeStatus: route.routeStatus,
      delayReason,
      lastLocationUpdate: resource.lastUpdated ? resource.lastUpdated.toISOString() : null,
      alternativeAction,
      generatedAt: nowIso(),
    }
  } catch (e) {
    console.error('[eta-risk] error:', e)
    return empty('database_unavailable')
  }
}

// ─── FEATURE 9 — CAPACITY-AWARE SAFE SHELTER MATCHING ───────────────────────
export interface ShelterMatch {
  available: boolean
  dataUnavailableReason?: string
  reference: { lat: number; lng: number } | null
  incidentType: string | null
  recommended: ShelterOption | null
  alternatives: ShelterOption[]
  note: string
}

export interface ShelterOption {
  id: string
  name: string
  type: string
  category: string
  availability: string
  status: 'OPEN' | 'LIMITED' | 'FULL' | 'CLOSED' | 'UNKNOWN'
  distanceKm: number
  estimatedMinutes: number | null
  totalCapacity: number | null
  occupied: number | null
  availableCapacity: number | null
  occupancyPct: number | null
  facilities: string[]
  safetyStatus: string
  lat: number
  lng: number
  source: string
  score: number
  reasons: string[]
}

export async function matchSafeShelter(params: {
  lat?: number
  lng?: number
  incidentId?: string
  incidentType?: string | null
  peopleAffected?: number | null
  limit?: number
}): Promise<ShelterMatch> {
  const limit = Math.max(1, Math.min(10, params.limit ?? 5))
  try {
    let lat = params.lat
    let lng = params.lng
    let incidentType = params.incidentType ?? null
    let people = params.peopleAffected ?? null

    if ((lat == null || lng == null) && params.incidentId) {
      const inc = await db.incident.findUnique({ where: { id: params.incidentId } })
      if (inc) { lat = inc.latitude; lng = inc.longitude; incidentType = incidentType ?? inc.type; people = people ?? inc.aiPeopleAffected }
    }
    if (lat == null || lng == null) {
      return { available: false, dataUnavailableReason: 'no_reference_location', reference: null, incidentType, recommended: null, alternatives: [], note: 'DATA UNAVAILABLE — no authorized reference location available.' }
    }

    // Gather all candidate shelter sources from existing models.
    const [safePlaces, safeZones, hospBeds] = await Promise.all([
      db.safePlace.findMany({ where: { type: { in: ['EMERGENCY_SHELTER', 'RELIEF_CENTER', 'SAFE_ZONE', 'HOSPITAL', 'EMERGENCY_MEDICAL_CENTER', 'EMERGENCY_SERVICE', 'FIRE_RESCUE'] } }, take: 100 }),
      db.safeZone.findMany({ take: 100 }),
      db.hospital.findMany({ take: 50 }),
    ])

    const options: ShelterOption[] = []
    const occupancyFromFeedback = new Map<string, number>()
    try {
      const feedback = await db.shelterFeedback.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
      for (const fb of feedback) {
        if (!occupancyFromFeedback.has(fb.shelterName) && fb.occupancyPct != null) occupancyFromFeedback.set(fb.shelterName, fb.occupancyPct)
      }
    } catch { /* ignore */ }

    for (const p of safePlaces) {
      const d = Number(haversineKm(lat, lng, p.latitude, p.longitude).toFixed(2))
      const avail = (p.availability || 'UNKNOWN').toUpperCase()
      const status = mapAvailability(avail)
      options.push({
        id: p.id, name: p.name, type: p.type, category: humanizeEnum(p.type), availability: avail,
        status, distanceKm: d, estimatedMinutes: d > 0 ? Math.max(1, Math.round((d / 40) * 60)) : null,
        totalCapacity: null, occupied: null, availableCapacity: null,
        occupancyPct: occupancyFromFeedback.get(p.name) ?? null,
        facilities: parseList(p.amenities), safetyStatus: avail, lat: p.latitude, lng: p.longitude,
        source: p.source || 'database', score: 0, reasons: [],
      })
    }
    for (const z of safeZones) {
      const d = Number(haversineKm(lat, lng, z.latitude, z.longitude).toFixed(2))
      const free = Math.max(0, z.capacity - z.occupancy)
      const pct = z.capacity > 0 ? Math.round((z.occupancy / z.capacity) * 100) : null
      const status: ShelterOption['status'] = /CLOSED/i.test(z.status) ? 'CLOSED' : free === 0 ? 'FULL' : pct != null && pct >= 85 ? 'LIMITED' : 'OPEN'
      options.push({
        id: z.id, name: z.name, type: z.type, category: humanizeEnum(z.type), availability: z.status,
        status, distanceKm: d, estimatedMinutes: d > 0 ? Math.max(1, Math.round((d / 40) * 60)) : null,
        totalCapacity: z.capacity, occupied: z.occupancy, availableCapacity: free, occupancyPct: pct,
        facilities: parseList(z.amenities), safetyStatus: z.riskLevel, lat: z.latitude, lng: z.longitude,
        source: z.source || 'database', score: 0, reasons: [],
      })
    }
    for (const h of hospBeds) {
      // Hospitals are medical safe places — capacity = available beds.
      const d = Number(haversineKm(lat, lng, h.latitude, h.longitude).toFixed(2))
      const status: ShelterOption['status'] = /CLOSED/i.test(h.status) ? 'CLOSED' : h.availableBeds === 0 ? 'FULL' : h.erLoadPct >= 85 ? 'LIMITED' : 'OPEN'
      options.push({
        id: h.id, name: h.name, type: 'HOSPITAL', category: 'Hospital', availability: h.status,
        status, distanceKm: d, estimatedMinutes: d > 0 ? Math.max(1, Math.round((d / 40) * 60)) : null,
        totalCapacity: h.totalBeds, occupied: h.totalBeds - h.availableBeds, availableCapacity: h.availableBeds,
        occupancyPct: h.totalBeds > 0 ? Math.round(((h.totalBeds - h.availableBeds) / h.totalBeds) * 100) : null,
        facilities: ['medical', 'emergency care'], safetyStatus: h.status, lat: h.latitude, lng: h.longitude,
        source: h.source || 'database', score: 0, reasons: [],
      })
    }

    // Capability requirement: medical incident prefers a hospital-capable shelter.
    const needsMedical = incidentType === 'MEDICAL' || incidentType === 'EARTHQUAKE' || incidentType === 'BUILDING_COLLAPSE' || incidentType === 'INDUSTRIAL_ACCIDENT'

    for (const o of options) {
      const reasons: string[] = []
      // Relevance
      let relevance = 0
      if (needsMedical && /HOSPITAL|MEDICAL/i.test(o.type)) { relevance += 25; reasons.push('Provides medical capability.') }
      if (!needsMedical && /SHELTER|RELIEF|SAFE_ZONE/i.test(o.type)) { relevance += 20; reasons.push('Suitable non-medical shelter.') }
      // Availability
      let availabilityScore = 0
      if (o.status === 'OPEN') { availabilityScore = 30; reasons.push('Open and accepting.') }
      else if (o.status === 'LIMITED') { availabilityScore = 15; reasons.push('Limited remaining capacity.') }
      else if (o.status === 'FULL') { availabilityScore = -30; reasons.push('Reported FULL.') }
      else if (o.status === 'CLOSED') { availabilityScore = -60; reasons.push('Reported CLOSED.') }
      // Capacity fit
      let capacityScore = 0
      if (o.availableCapacity != null && people != null) {
        if (o.availableCapacity >= people) { capacityScore = 20; reasons.push('Capacity covers ' + people + ' people.') }
        else { capacityScore = -10; reasons.push('Insufficient capacity for ' + people + ' people.') }
      } else if (o.availableCapacity != null) {
        capacityScore = 5
      }
      // Distance
      const distancePenalty = Math.min(60, o.distanceKm * 3)
      const score = relevance + availabilityScore + capacityScore - distancePenalty
      o.score = Number(score.toFixed(2))
      o.reasons = reasons
    }

    // Exclude CLOSED from recommendations.
    const usable = options.filter((o) => o.status !== 'CLOSED').sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
    if (usable.length === 0) {
      return {
        available: true, reference: { lat, lng }, incidentType,
        recommended: null, alternatives: [],
        note: 'No suitable safe place is currently indexed for this location.',
      }
    }
    const recommended = usable[0]
    const alternatives = usable.slice(1, limit)
    await saveInsight({
      incidentId: params.incidentId ?? null, feature: 'SHELTER_MATCH', severity: 'LOW', confidence: 0.7,
      payload: { recommended: { name: recommended.name, score: recommended.score, status: recommended.status }, alternatives: alternatives.map((a) => a.name) },
    })
    return { available: true, reference: { lat, lng }, incidentType, recommended, alternatives, note: 'Ranked by relevance, availability, capacity fit, then distance.' }
  } catch (e) {
    console.error('[shelter-match] error:', e)
    return { available: false, dataUnavailableReason: 'database_unavailable', reference: null, incidentType: params.incidentType ?? null, recommended: null, alternatives: [], note: 'DATA UNAVAILABLE.' }
  }
}

function mapAvailability(a: string): ShelterOption['status'] {
  const u = (a || '').toUpperCase()
  if (u.includes('CLOSED')) return 'CLOSED'
  if (u.includes('FULL')) return 'FULL'
  if (u.includes('LIMITED') || u.includes('BUSY')) return 'LIMITED'
  if (u.includes('OPEN') || u.includes('ACCEPTING')) return 'OPEN'
  return 'UNKNOWN'
}
function parseList(json: string | null | undefined): string[] {
  if (!json) return []
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.map(String) : [String(v)] } catch { return json.split(',').map((s) => s.trim()).filter(Boolean) }
}

// ─── FEATURE 10 — NEXT-INCIDENT PREDICTION & RESOURCE PRE-POSITIONING ───────
export interface PrePositioningPlan {
  available: boolean
  dataUnavailableReason?: string
  generatedAt: string
  zones: Array<{
    zone: string
    attention: 'HIGH_ATTENTION_ZONE' | 'MEDIUM_ATTENTION_ZONE' | 'LOW_ATTENTION_ZONE'
    priority: number
    centerLat: number | null
    centerLng: number | null
    activeIncidentCount: number
    historicIncidentCount: number
    dominantTypes: string[]
    recommendedResources: Array<{ type: string; quantity: number }>
    suggestedStagingLocation: string
    reason: string
  }>
  note: string
}

export async function computePrePositioning(): Promise<PrePositioningPlan> {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const [active, historic, resources] = await Promise.all([
      db.incident.findMany({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } }, take: 200 }),
      db.incident.findMany({ where: { createdAt: { gte: since } }, take: 500 }),
      db.resource.findMany(),
    ])

    const zones = new Map<string, {
      centerLat: number; centerLng: number; active: number; historic: number; types: Map<string, number>; names: string[]
    }>()

    const keyFor = (inc: { latitude: number; longitude: number }) => {
      // ~11 km grid cell
      const lat = Math.round(inc.latitude * 10) / 10
      const lng = Math.round(inc.longitude * 10) / 10
      return lat.toFixed(1) + ',' + lng.toFixed(1)
    }
    const add = (inc: { latitude: number; longitude: number; type: string; location: string }, isActive: boolean) => {
      const k = keyFor(inc)
      const z: { centerLat: number; centerLng: number; active: number; historic: number; types: Map<string, number>; names: string[] } = zones.get(k) || { centerLat: parseFloat(k.split(',')[0]), centerLng: parseFloat(k.split(',')[1]), active: 0, historic: 0, types: new Map<string, number>(), names: [] as string[] }
      if (isActive) z.active += 1
      z.historic += 1
      z.types.set(inc.type, (z.types.get(inc.type) || 0) + 1)
      if (inc.location && !z.names.includes(inc.location)) z.names.push(inc.location)
      zones.set(k, z)
    }
    for (const i of active) add(i, true)
    for (const i of historic) if (!active.some((a) => a.id === i.id)) add(i, false)

    if (zones.size === 0) {
      return { available: true, generatedAt: nowIso(), zones: [], note: 'No incident history is available to build a preparedness recommendation.' }
    }

    const out: PrePositioningPlan['zones'] = []
    for (const [k, z] of zones.entries()) {
      const dominant = [...z.types.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
      const priority = z.active * 3 + z.historic
      const attention: PrePositioningPlan['zones'][number]['attention'] = priority >= 10 ? 'HIGH_ATTENTION_ZONE' : priority >= 4 ? 'MEDIUM_ATTENTION_ZONE' : 'LOW_ATTENTION_ZONE'

      const recommendedResources: Array<{ type: string; quantity: number }> = []
      const typeCount = new Map<string, number>()
      for (const t of dominant) for (const rt of (NEED_MATRIX[t] || NEED_MATRIX.OTHER)) typeCount.set(rt, (typeCount.get(rt) || 0) + 1)
      const multiplier = attention === 'HIGH_ATTENTION_ZONE' ? 2 : attention === 'MEDIUM_ATTENTION_ZONE' ? 1 : 1
      for (const [type, freq] of [...typeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        recommendedResources.push({ type, quantity: Math.max(1, Math.min(4, Math.ceil(freq * multiplier / 2))) })
      }

      const stagingLocation = z.names[0] || ('Grid ' + k)
      out.push({
        zone: k,
        attention,
        priority,
        centerLat: z.centerLat,
        centerLng: z.centerLng,
        activeIncidentCount: z.active,
        historicIncidentCount: z.historic,
        dominantTypes: dominant.slice(0, 4),
        recommendedResources,
        suggestedStagingLocation: stagingLocation,
        reason: z.active + ' active and ' + z.historic + ' recent incident(s) in this cell; dominant type(s): ' + dominant.slice(0, 3).map(humanizeEnum).join(', ') + '.',
      })
    }

    out.sort((a, b) => b.priority - a.priority)
    const trimmed = out.slice(0, 12)

    await saveInsight({
      incidentId: null, feature: 'PRE_POSITIONING', severity: trimmed.some((z) => z.attention === 'HIGH_ATTENTION_ZONE') ? 'HIGH' : 'MEDIUM',
      confidence: 0.6, payload: { zones: trimmed, inventory: resources.reduce((acc: Record<string, number>, r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc }, {}) },
    })

    return {
      available: true,
      generatedAt: nowIso(),
      zones: trimmed,
      note: 'Preparedness recommendation derived from incident density + history. NOT a guaranteed prediction.',
    }
  } catch (e) {
    console.error('[pre-positioning] error:', e)
    return { available: false, dataUnavailableReason: 'database_unavailable', generatedAt: nowIso(), zones: [], note: 'DATA UNAVAILABLE.' }
  }
}

// ─── FEATURE 6 — CROWD-SOURCED DAMAGE CLUSTERING ────────────────────────────
export interface DamageCluster {
  clusterKey: string
  centerLat: number
  centerLng: number
  reportCount: number
  verifiedCount: number
  possibleDamageCount: number
  roadBlockageCount: number
  floodZoneCount: number
  highRisk: boolean
  dominantTypes: string[]
  layers: string[]
  areaLabel: string | null
}

export async function buildDamageClusters(): Promise<{ available: boolean; dataUnavailableReason?: string; clusters: DamageCluster[]; note: string }> {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    const [incidents, hazards] = await Promise.all([
      db.incident.findMany({ where: { createdAt: { gte: since } }, take: 300 }),
      db.hazardReport.findMany({ where: { createdAt: { gte: since } }, take: 300 }),
    ])

    type Point = {
      lat: number; lng: number; kind: 'INCIDENT' | 'HAZARD'; type: string; verified: boolean; label: string | null; highRisk: boolean; roadBlocked: boolean
    }
    const points: Point[] = []
    for (const i of incidents) {
      points.push({
        lat: i.latitude, lng: i.longitude, kind: 'INCIDENT', type: i.type,
        verified: ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(i.status),
        label: i.location, highRisk: i.riskLevel === 'HIGH' || i.riskLevel === 'CRITICAL',
        roadBlocked: Boolean(i.aiRoadBlocked) || i.type === 'ROAD_BLOCKAGE',
      })
    }
    for (const h of hazards) {
      points.push({
        lat: h.latitude, lng: h.longitude, kind: 'HAZARD', type: h.hazardType,
        verified: h.verified || h.status === 'CONFIRMED', label: h.location,
        highRisk: h.severity === 'HIGH' || h.severity === 'CRITICAL',
        roadBlocked: h.hazardType === 'BLOCKED_ROAD',
      })
    }
    if (points.length === 0) {
      return { available: true, clusters: [], note: 'No recent citizen/hazard reports to cluster.' }
    }

    // Simple grid-based spatial clustering (~2 km cells).
    const CELL = 0.02
    const buckets = new Map<string, Point[]>()
    for (const p of points) {
      const k = (Math.round(p.lat / CELL) * CELL).toFixed(3) + ',' + (Math.round(p.lng / CELL) * CELL).toFixed(3)
      const arr = buckets.get(k) || []
      arr.push(p)
      buckets.set(k, arr)
    }

    const clusters: DamageCluster[] = []
    for (const [key, arr] of buckets.entries()) {
      if (arr.length === 0) continue
      const centerLat = arr.reduce((s, p) => s + p.lat, 0) / arr.length
      const centerLng = arr.reduce((s, p) => s + p.lng, 0) / arr.length
      const typeCount = new Map<string, number>()
      for (const p of arr) typeCount.set(p.type, (typeCount.get(p.type) || 0) + 1)
      const verifiedCount = arr.filter((p) => p.verified).length
      const roadBlockageCount = arr.filter((p) => p.roadBlocked).length
      const floodZoneCount = arr.filter((p) => /FLOOD|RAIN|CYCLONE|WATER/i.test(p.type)).length
      const possibleDamageCount = arr.filter((p) => !p.verified).length
      const highRisk = arr.some((p) => p.highRisk) || arr.length >= 4
      const layers: string[] = []
      if (arr.length > 1) layers.push('MULTIPLE_REPORTS')
      if (verifiedCount > 0) layers.push('VERIFIED_CONFIRMED')
      if (possibleDamageCount > 0) layers.push('POSSIBLE_DAMAGE')
      if (roadBlockageCount > 0) layers.push('ROAD_BLOCKAGE')
      if (floodZoneCount > 0) layers.push('FLOOD_ZONE')
      if (highRisk) layers.push('HIGH_RISK_AREA')
      clusters.push({
        clusterKey: key,
        centerLat: Number(centerLat.toFixed(5)),
        centerLng: Number(centerLng.toFixed(5)),
        reportCount: arr.length,
        verifiedCount,
        possibleDamageCount,
        roadBlockageCount,
        floodZoneCount,
        highRisk,
        dominantTypes: [...typeCount.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 4),
        layers,
        areaLabel: arr.find((p) => p.label)?.label ?? null,
      })
    }
    clusters.sort((a, b) => b.reportCount - a.reportCount)

    await saveInsight({ incidentId: null, feature: 'DAMAGE_CLUSTERS', severity: clusters.some((c) => c.highRisk) ? 'HIGH' : 'MEDIUM', confidence: 0.6, payload: { clusters: clusters.slice(0, 20) } })

    return { available: true, clusters, note: 'Clusters combine recent incident + hazard reports in ~2 km cells. No private citizen data is included.' }
  } catch (e) {
    console.error('[damage-clusters] error:', e)
    return { available: false, dataUnavailableReason: 'database_unavailable', clusters: [], note: 'DATA UNAVAILABLE.' }
  }
}
// ─── FEATURE 7 — PHOTO-TO-IMPACT INTELLIGENCE ───────────────────────────────
// Analyses an uploaded image's METADATA + optional AI description. The system
// never claims exact facts that cannot be derived from the image. When image
// analysis is unavailable, returns an honest "AI unavailable" result.
export interface PhotoImpact {
  available: boolean
  dataUnavailableReason?: string
  incidentId?: string | null
  photoId?: string | null
  source: 'ai' | 'deterministic' | 'unavailable'
  observedConditions: string[]
  possibleHazards: string[]
  affectedInfrastructure: string[]
  accessibility: string
  confidence: number | null
  notes: string
  generatedAt: string
}

const OBSERVED_CATEGORIES = [
  'Flooding', 'Road blockage', 'Building damage', 'Fallen infrastructure',
  'Fire/smoke', 'Debris', 'Unsafe access', 'Crowd/people presence',
  'Vehicle obstruction', 'Other visible hazards',
]

export async function analyzePhotoImpact(params: {
  incidentId?: string
  photoId?: string
  imageMeta?: { filename?: string; size?: number; contentType?: string } | null
  incidentType?: string | null
  description?: string | null
}, userId?: string): Promise<PhotoImpact> {
  const unavailable = (reason: string): PhotoImpact => ({
    available: false,
    dataUnavailableReason: reason,
    incidentId: params.incidentId ?? null,
    photoId: params.photoId ?? null,
    source: 'unavailable',
    observedConditions: [],
    possibleHazards: [],
    affectedInfrastructure: [],
    accessibility: 'DATA UNAVAILABLE',
    confidence: null,
    notes: 'AI image analysis is unavailable. No facts have been inferred from the image.',
    generatedAt: nowIso(),
  })

  try {
    // Pull the stored image metadata (existing Incident.imageMeta field).
    let meta = params.imageMeta ?? null
    let incidentType = params.incidentType ?? null
    let description = params.description ?? null
    if (params.incidentId) {
      const inc = await db.incident.findUnique({ where: { id: params.incidentId }, select: { imageMeta: true, type: true, description: true } })
      if (inc) {
        incidentType = incidentType ?? inc.type
        description = description ?? inc.description
        if (!meta && inc.imageMeta) { try { meta = JSON.parse(inc.imageMeta) } catch { meta = null } }
      }
    }
    if (!meta && !description) return unavailable('no_image_metadata')

    // Deterministic baseline from incident type + description keywords (never invents image facts).
    const hay = ((description || '') + ' ' + (incidentType || '')).toLowerCase()
    const observed: string[] = []
    const hazards: string[] = []
    const infra: string[] = []
    if (/flood|water|rain|cyclone/.test(hay)) { observed.push('Flooding'); infra.push('Road'); hazards.push('Water hazard') }
    if (/road|block|traffic/.test(hay)) { observed.push('Road blockage'); hazards.push('Unsafe access') }
    if (/collaps|building|structure/.test(hay)) { observed.push('Building damage'); infra.push('Building') }
    if (/fire|smoke|burn/.test(hay)) { observed.push('Fire/smoke'); hazards.push('Fire hazard') }
    if (/debris|rubble|tree/.test(hay)) { observed.push('Debris') }
    if (/power|electric|line|pole/.test(hay)) { infra.push('Power infrastructure'); hazards.push('Electrical hazard') }
    const accessibility = /road|block|debris/.test(hay) ? 'Possibly restricted — verify on scene' : 'Not determined from metadata'

    // AI attempt (optional) — image analysis is best-effort only.
    let source: PhotoImpact['source'] = 'deterministic'
    let confidence: number | null = null
    const aiResult = await tryAI(
      () => askAI(
        'You are a disaster image triage assistant. You are given ONLY incident metadata and a written description (no raw pixels). Return STRICT JSON with keys: observedConditions (array of strings from the allowed categories), possibleHazards (array of strings), affectedInfrastructure (array of strings), accessibility (string), confidence (number 0-1), notes (string). Only report what is reasonably supported. Allowed categories: ' + OBSERVED_CATEGORIES.join(', ') + '.',
        'filename=' + (meta?.filename ?? 'n/a') + ' contentType=' + (meta?.contentType ?? 'n/a') + ' incidentType=' + (incidentType ?? 'unknown') + ' description=' + (description ?? ''),
      ),
      (c) => {
        try {
          const cleaned = c.replace(/```json/gi, '').replace(/```/g, '').trim()
          const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}')
          if (start < 0 || end < 0) return null
          return JSON.parse(cleaned.slice(start, end + 1))
        } catch { return null }
      },
    )
    if (aiResult && Array.isArray(aiResult.observedConditions)) {
      source = 'ai'
      confidence = typeof aiResult.confidence === 'number' ? Math.max(0, Math.min(1, aiResult.confidence)) : 0.5
      observed.length = 0
      observed.push(...aiResult.observedConditions.filter((x: any) => OBSERVED_CATEGORIES.includes(String(x))))
      hazards.length = 0
      hazards.push(...(aiResult.possibleHazards || []).map(String))
      infra.length = 0
      infra.push(...(aiResult.affectedInfrastructure || []).map(String))
    }

    const impact: PhotoImpact = {
      available: true,
      incidentId: params.incidentId ?? null,
      photoId: params.photoId ?? null,
      source,
      observedConditions: observed,
      possibleHazards: hazards,
      affectedInfrastructure: infra,
      accessibility,
      confidence,
      notes: source === 'ai'
        ? 'AI-assisted triage from incident metadata and description. Confidence is indicative only — verify on scene.'
        : 'Deterministic triage from incident metadata and description (AI unavailable). Verify on scene.',
      generatedAt: nowIso(),
    }

    await saveInsight({
      incidentId: params.incidentId ?? null, feature: 'PHOTO_IMPACT', severity: hazards.length > 1 ? 'HIGH' : 'MEDIUM',
      confidence: confidence ?? 0.5, source, payload: impact,
      createdById: userId ?? null,
    })
    return impact
  } catch (e) {
    console.error('[photo-impact] error:', e)
    return unavailable('analysis_failed')
  }
}

// ─── AGGREGATED SNAPSHOT for the AI Response Intelligence center ────────────
export async function getResponseIntelOverview(incidentId?: string) {
  const [twin, clusters, prepositioning, corridor, swap, shelter] = await Promise.all([
    getDisasterTwin(incidentId).catch(() => null),
    buildDamageClusters().catch(() => null),
    computePrePositioning().catch(() => null),
    incidentId ? buildRescueCorridor(incidentId).catch(() => null) : Promise.resolve(null),
    incidentId ? recommendResourceSwap(incidentId).catch(() => null) : Promise.resolve(null),
    matchSafeShelter({ incidentId, limit: 3 }).catch(() => null),
  ])
  return { twin, clusters, prepositioning, corridor, swap, shelter, generatedAt: nowIso() }
}
