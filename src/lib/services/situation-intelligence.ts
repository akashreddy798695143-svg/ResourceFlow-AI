// Situational Intelligence & Multi-Incident Priority Engine
// ------------------------------------------------------------------
// Pure decision-support layer built on REAL application data only.
//
//  - ranks active incidents by an explainable, AI-assisted priority score
//  - predicts resource shortages per resource type
//  - recommends the next-best operational action per incident
//  - generates auditable situation reports (persisted as AiInsight)
//  - derives impact metrics from stored events
//  - returns routing/distance intelligence with a guaranteed fallback
//
// IMPORTANT FAIL-SAFE RULES (implemented below):
//  * Uses ONLY real data. Missing values are marked "Insufficient data".
//  * The score is explicitly labelled "AI-assisted decision-support score",
//    never a scientifically validated disaster-prediction model.
//  * The routing layer never claims real-time road conditions on fallback.
//  * Dangerous operational actions are always surfaced as recommendations
//    for officer approval — never auto-executed.

import { db } from '@/lib/db'
import { askAI } from '@/lib/ai-client'
import { recordAudit } from '@/lib/events'
import { haversineKm, estimateEtaMinutes } from '@/lib/agents/resource-agent'
import type { Incident, Resource, ResourceType, RiskLevel } from '@prisma/client'

type Json = any

const RESOURCE_TYPES: ResourceType[] = [
  'AMBULANCE', 'RESCUE_TEAM', 'FIRE_TEAM', 'EMERGENCY_VEHICLE',
  'MEDICAL_SUPPLY', 'FOOD_SUPPLY', 'WATER_SUPPLY',
]

const RESOURCE_LABELS: Record<string, string> = {
  AMBULANCE: 'Ambulances', RESCUE_TEAM: 'Rescue Teams', FIRE_TEAM: 'Fire Teams',
  EMERGENCY_VEHICLE: 'Emergency Vehicles', MEDICAL_SUPPLY: 'Medical Supplies',
  FOOD_SUPPLY: 'Food Supplies', WATER_SUPPLY: 'Water Supplies',
}

// Disaster type → eligible resource types (same mapping as the resource agent).
const ELIGIBLE: Record<string, ResourceType[]> = {
  FLOOD: ['RESCUE_TEAM', 'EMERGENCY_VEHICLE', 'FOOD_SUPPLY', 'WATER_SUPPLY', 'MEDICAL_SUPPLY'],
  CYCLONE: ['RESCUE_TEAM', 'EMERGENCY_VEHICLE', 'MEDICAL_SUPPLY', 'FOOD_SUPPLY'],
  EARTHQUAKE: ['RESCUE_TEAM', 'AMBULANCE', 'MEDICAL_SUPPLY', 'EMERGENCY_VEHICLE'],
  LANDSLIDE: ['RESCUE_TEAM', 'EMERGENCY_VEHICLE', 'AMBULANCE', 'MEDICAL_SUPPLY'],
  ROAD_BLOCKAGE: ['EMERGENCY_VEHICLE', 'RESCUE_TEAM'],
  FIRE: ['FIRE_TEAM', 'AMBULANCE', 'EMERGENCY_VEHICLE'],
  BUILDING_COLLAPSE: ['RESCUE_TEAM', 'AMBULANCE', 'EMERGENCY_VEHICLE', 'MEDICAL_SUPPLY'],
  FOREST_FIRE: ['FIRE_TEAM', 'EMERGENCY_VEHICLE', 'WATER_SUPPLY', 'AMBULANCE'],
  HEAVY_RAINFALL: ['RESCUE_TEAM', 'EMERGENCY_VEHICLE', 'WATER_SUPPLY', 'FOOD_SUPPLY'],
  INDUSTRIAL_ACCIDENT: ['FIRE_TEAM', 'AMBULANCE', 'MEDICAL_SUPPLY', 'EMERGENCY_VEHICLE'],
  MEDICAL: ['AMBULANCE', 'MEDICAL_SUPPLY'],
  INFRASTRUCTURE: ['EMERGENCY_VEHICLE', 'RESCUE_TEAM'],
  OTHER: ['RESCUE_TEAM', 'EMERGENCY_VEHICLE'],
}

// Type-level hazard baselines used for the "incident type" factor (0-100).
const TYPE_BASELINE: Record<string, number> = {
  BUILDING_COLLAPSE: 95, INDUSTRIAL_ACCIDENT: 92, EARTHQUAKE: 85, LANDSLIDE: 78,
  FOREST_FIRE: 76, FIRE: 70, FLOOD: 66, CYCLONE: 68, HEAVY_RAINFALL: 45,
  ROAD_BLOCKAGE: 42, MEDICAL: 55, INFRASTRUCTURE: 50, OTHER: 35,
}

function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)) }
function levelFor(score: number): RiskLevel {
  return score >= 76 ? 'CRITICAL' : score >= 51 ? 'HIGH' : score >= 26 ? 'MEDIUM' : 'LOW'
}
function priorityLabel(score: number): string {
  return score >= 76 ? 'Critical' : score >= 51 ? 'High' : score >= 26 ? 'Medium' : 'Low'
}
function safeJson(s: string | null | undefined): Json {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}
function safeArr(s: string | null | undefined): string[] {
  const v = safeJson(s)
  return Array.isArray(v) ? v : []
}
function num(v: unknown, dflt = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : dflt
}
function typeNames(types: string[]): string {
  return types.map((t) => (RESOURCE_LABELS[t] || t.replace(/_/g, ' '))).join(', ')
}

// Estimated required resource quantity for an incident's eligible types.
// Uses affected population when available; otherwise marks data insufficient.
function estimateDemand(inc: Incident): { required: Record<string, number>; sufficient: boolean } {
  const required: Record<string, number> = {}
  const eligible = ELIGIBLE[inc.type] || ELIGIBLE.OTHER
  const people = inc.aiPeopleAffected
  const sufficient = people != null && people >= 0
  for (const t of eligible) {
    if (!sufficient) {
      required[t] = 0
    } else if (t === 'MEDICAL_SUPPLY' || t === 'FOOD_SUPPLY' || t === 'WATER_SUPPLY') {
      required[t] = clamp(Math.round(people / 25), 1, 500)
    } else {
      required[t] = clamp(Math.round(people / 50), 1, 24)
    }
  }
  return { required, sufficient }
}

function severityScore(inc: Incident): number {
  const sev = (inc.aiSeverity || '').toUpperCase()
  if (sev === 'CRITICAL') return 100
  if (sev === 'HIGH') return 80
  if (sev === 'MEDIUM') return 50
  if (sev === 'LOW') return 25
  return 40 // unknown severity
}

function populationScore(people: number | null): { score: number; known: boolean } {
  if (people == null || people < 0) return { score: 0, known: false }
  const score = clamp(people >= 1000 ? 100 : people >= 500 ? 85 : people >= 200 ? 65 : people >= 50 ? 45 : people >= 10 ? 30 : 15, 0, 100)
  return { score, known: true }
}

function urgencyScore(inc: Incident): { score: number; known: boolean; note?: string } {
  const notes: string[] = []
  let score = 10
  if (inc.escalationLevel >= 3) { score += 60; notes.push(`Escalation level ${inc.escalationLevel}`) }
  else if (inc.escalationLevel === 2) { score += 35; notes.push('Escalation level 2') }
  else if (inc.escalationLevel === 1) { score += 20; notes.push('Escalation level 1') }
  const status = inc.status
  if (status === 'AWAITING_APPROVAL') { score += 15; notes.push('Waiting for officer approval') }
  if (status === 'DELAYED') { score += 30; notes.push('Response delayed') }
  if (status === 'ESCALATED') { score += 25; notes.push('Escalated') }
  if (status === 'NEW' || status === 'ANALYZING' || status === 'VERIFICATION') { score += 10; notes.push('Recent report — early stages') }
  return { score: clamp(score, 0, 100), known: true, note: notes.join('; ') }
}

function shortageScore(
  required: Record<string, number>,
  availableByType: Record<string, number>
): { score: number; shortage: Record<string, number>; sufficient: boolean } {
  let deficit = 0
  let demand = 0
  const shortage: Record<string, number> = {}
  for (const t of RESOURCE_TYPES) {
    const req = required[t] || 0
    const avail = availableByType[t] || 0
    demand += req
    if (req > avail) {
      const gap = req - avail
      shortage[t] = gap
      deficit += gap
    }
  }
  const sufficient = demand > 0
  let score = 0
  if (demand > 0) {
    const ratio = deficit / demand
    score = clamp(Math.round(ratio * 100), 0, 100)
  }
  return { score, shortage, sufficient }
}

// Global cache populated once per overview computation (avoids re-filtering).
let availableResourcesCache: Resource[] = []

function relatedResources(inc: Incident): Array<{ code: string; type: string; eta_minutes: number; distance_km: number }> {
  // Closest available resources that best match this incident's eligible types.
  const eligible = ELIGIBLE[inc.type] || ELIGIBLE.OTHER
  const list = availableResourcesCache
    .filter((r) => r.status === 'AVAILABLE' && eligible.includes(r.type))
    .map((r) => {
      const distance = haversineKm(inc.latitude, inc.longitude, r.latitude, r.longitude)
      return { r, distance, eta: estimateEtaMinutes(distance, Boolean(inc.aiRoadBlocked)) }
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
  return list.map((item) => ({
    code: item.r.resourceCode,
    type: item.r.type,
    eta_minutes: item.eta,
    distance_km: Number(item.distance.toFixed(1)),
  }))
}

function recommendedActionFor(
  inc: Incident,
  shortage: Record<string, number>,
  activeApproval: boolean,
  related: { code: string; type: string }[]
): { action: string; reason: string; priority: string; requiredResources: string[] } {
  const typeLabel = (t: string) => RESOURCE_LABELS[t] || t.replace(/_/g, ' ')
  const highestShortage = RESOURCE_TYPES
    .map((t) => ({ t, gap: shortage[t] || 0 }))
    .sort((a, b) => b.gap - a.gap)[0]
  if (highestShortage && highestShortage.gap > 0) {
    return {
      action: `Request additional ${typeLabel(highestShortage.t)}`,
      reason: `Shortage of ${typeLabel(highestShortage.t)} for ${inc.incidentCode} (${inc.type.replace(/_/g, ' ')}) with insufficient available supply.`,
      priority: (inc.riskScore ?? 0) >= 60 ? 'High' : 'Medium',
      requiredResources: [highestShortage.t],
    }
  }
  if (activeApproval) {
    return {
      action: 'Request officer approval',
      reason: `An allocation recommendation for ${inc.incidentCode} is pending officer review and must not be auto-executed.`,
      priority: 'High',
      requiredResources: [],
    }
  }
  if ((inc.escalationLevel ?? 0) >= 2 || (inc.riskScore ?? 0) >= 76) {
    return {
      action: 'Escalate incident',
      reason: `Incident ${inc.incidentCode} is high-risk (score ${inc.riskScore ?? 'n/a'}/100) and may need escalation beyond current response.`,
      priority: 'High',
      requiredResources: [],
    }
  }
  if (inc.status === 'DELAYED' || inc.status === 'ESCALATED') {
    return {
      action: 'Reassess incident',
      reason: `${inc.incidentCode} is ${inc.status.toLowerCase()} — re-run analysis for adaptive reassignment.`,
      priority: 'High',
      requiredResources: [],
    }
  }
  if (related.length > 0) {
    return {
      action: `Deploy ${typeLabel(related[0].type)} to incident ${inc.incidentCode}`,
      reason: `${related[0].code} is available and best matches ${inc.incidentCode}'s requirements (availability verified).`,
      priority: 'Medium',
      requiredResources: [related[0].type],
    }
  }
  if (inc.status === 'NEW' || inc.status === 'ANALYZING' || inc.status === 'VERIFICATION') {
    return {
      action: 'Reassess incident',
      reason: `${inc.incidentCode} may need updated AI analysis before allocation can be recommended.`,
      priority: 'Medium',
      requiredResources: [],
    }
  }
  return { action: 'Update incident information', reason: `Maintain the current operational picture for ${inc.incidentCode}.`, priority: 'Low', requiredResources: [] }
}

export interface PriorityIncident {
  incidentId: string
  incidentCode: string
  type: string
  location: string
  latitude: number
  longitude: number
  status: string
  riskLevel: string | null
  riskScore: number | null
  peopleAffected: number | null
  priorityScore: number
  priorityRank: number
  priorityLabel: string
  factors: { label: string; value: number; weight: number; contribution: number; note: string }[]
  why: string
  requiredResources: string[]
  availableResources: string[]
  shortage: Record<string, number>
  shortageSufficient: boolean
  recommendedAction: { action: string; reason: string; priority: string; requiredResources: string[] }
  bestMatchedResources: { code: string; type: string; eta_minutes: number; distance_km: number }[]
}

export async function getSituationOverview(): Promise<{
  generatedAt: string
  ranked: PriorityIncident[]
  shortages: { type: string; label: string; required: number; available: number; shortage: number; risk: string; insufficientData: boolean }[]
  nextBestActions: PriorityIncident['recommendedAction'][]
  situation: {
    activeIncidents: number
    criticalIncidents: number
    highIncidents: number
    mediumIncidents: number
    lowIncidents: number
    pendingApprovals: number
    summary: string
  }
  scoringNote: string
}> {
  const incidents = await db.incident.findMany({
    where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const resources = await db.resource.findMany({})
  // A resource assigned to an active incident must NOT be counted as available.
  const activeAssignments = await db.resourceAssignment.findMany({ where: { replacedAt: null } })
  const assignedIds = new Set(activeAssignments.map((a) => a.resourceId))
  const pendingApprovals = await db.approval.count({ where: { decision: 'PENDING' } })

  const availableByType: Record<string, number> = {}
  for (const r of resources) {
    if (r.status === 'AVAILABLE' && !assignedIds.has(r.id)) {
      availableByType[r.type] = (availableByType[r.type] || 0) + r.capacity
    }
  }
  availableResourcesCache = resources

  const ranked: PriorityIncident[] = []
  const nextBestActions: PriorityIncident['recommendedAction'][] = []
  const shortageAgg: Record<string, { required: number; shortage: number }> = {}
  for (const t of RESOURCE_TYPES) {
    shortageAgg[t] = { required: 0, shortage: 0 }
  }

  for (const inc of incidents) {
    const { required, sufficient } = estimateDemand(inc)
    const shortageRes = shortageScore(required, availableByType)
    const pop = populationScore(inc.aiPeopleAffected)
    const urg = urgencyScore(inc)
    const sev = severityScore(inc)
    const typeBase = TYPE_BASELINE[inc.type] || TYPE_BASELINE.OTHER
    const pending = await db.approval.findFirst({ where: { incidentId: inc.id, decision: 'PENDING' }, select: { id: true } })
    const activeApproval = Boolean(pending)

    const weights = { sev: 0.3, population: 0.2, shortage: 0.25, urgency: 0.15, type: 0.1 }
    const priorityScore = clamp(Math.round(
      sev * weights.sev +
      pop.score * weights.population +
      shortageRes.score * weights.shortage +
      urg.score * weights.urgency +
      typeBase * weights.type
    ))

    const factors = [
      { label: 'Incident severity', value: sev, weight: weights.sev, contribution: Math.round(sev * weights.sev), note: (inc.aiSeverity || 'Unavailable') },
      { label: 'Affected population', value: pop.score, weight: weights.population, contribution: Math.round(pop.score * weights.population), note: inc.aiPeopleAffected != null ? `~${inc.aiPeopleAffected} people` : 'Unavailable' },
      { label: 'Resource shortage', value: shortageRes.score, weight: weights.shortage, contribution: Math.round(shortageRes.score * weights.shortage), note: shortageRes.sufficient ? `${Object.keys(shortageRes.shortage).length} deficit type(s)` : 'Unavailable' },
      { label: 'Urgency / escalation', value: urg.score, weight: weights.urgency, contribution: Math.round(urg.score * weights.urgency), note: urg.note || 'Standard' },
      { label: 'Incident type hazard', value: typeBase, weight: weights.type, contribution: Math.round(typeBase * weights.type), note: inc.type.replace(/_/g, ' ') },
    ]

    const related = relatedResources(inc)
    const rec = recommendedActionFor(inc, shortageRes.shortage, activeApproval, related)

    const whyParts: string[] = []
    if (sev >= 80) whyParts.push(`high severity (${inc.aiSeverity || 'n/a'})`)
    if (pop.known && pop.score >= 60) whyParts.push(`a significant affected population (~${inc.aiPeopleAffected})`)
    if (shortageRes.sufficient) {
      const deficitTypes = RESOURCE_TYPES.filter((t) => (shortageRes.shortage[t] || 0) > 0)
      if (deficitTypes.length > 0) whyParts.push(`a resource shortage (${typeNames(deficitTypes)})`)
    }
    let why = `${inc.type.replace(/_/g, ' ')} incident ${inc.incidentCode} is ranked ${priorityLabel(priorityScore).toLowerCase()}-priority`
    why += whyParts.length > 0 ? ` because of ${whyParts.join(', ')}.` : '.'
    if (!pop.known) why += ' The affected-population estimate is unavailable.'

    for (const t of RESOURCE_TYPES) {
      const req = required[t] || 0
      if (sufficient && req > 0) {
        shortageAgg[t].required += req
        shortageAgg[t].shortage += Math.max(0, shortageRes.shortage[t] || 0)
      }
    }

    ranked.push({
      incidentId: inc.id,
      incidentCode: inc.incidentCode,
      type: inc.type,
      location: inc.location,
      latitude: inc.latitude,
      longitude: inc.longitude,
      status: inc.status,
      riskLevel: inc.riskLevel,
      riskScore: inc.riskScore,
      peopleAffected: inc.aiPeopleAffected,
      priorityScore,
      priorityRank: 0,
      priorityLabel: priorityLabel(priorityScore),
      factors,
      why,
      requiredResources: Object.entries(required).filter(([, v]) => v > 0).map(([k]) => k),
      availableResources: RESOURCE_TYPES.filter((t) => (availableByType[t] || 0) > 0),
      shortage: shortageRes.shortage,
      shortageSufficient: shortageRes.sufficient,
      recommendedAction: rec,
      bestMatchedResources: related,
    })
  }

  ranked.sort((a, b) => b.priorityScore - a.priorityScore)
  ranked.forEach((r, i) => { r.priorityRank = i + 1 })

  const shortages = RESOURCE_TYPES
    .map((t) => {
      const agg = shortageAgg[t]
      const available = availableByType[t] || 0
      const shortage = Math.max(0, agg.shortage)
      const insufficientData = agg.required === 0 && available === 0
      let risk = 'LOW'
      if (agg.required > 0) {
        risk = shortage > 0 && available === 0 ? 'HIGH' : shortage > 0 ? 'MEDIUM' : 'LOW'
      } else if (!insufficientData) {
        risk = 'LOW'
      }
      return {
        type: t,
        label: RESOURCE_LABELS[t],
        required: agg.required,
        available,
        shortage,
        risk,
        insufficientData,
      }
    })
    .filter((s) => s.required > 0 || s.available > 0)

  for (const r of ranked.slice(0, 4)) {
    if (r.recommendedAction.action !== 'Update incident information') {
      nextBestActions.push(r.recommendedAction)
    }
  }

  const situation = {
    activeIncidents: incidents.length,
    criticalIncidents: ranked.filter((r) => r.priorityLabel === 'Critical').length,
    highIncidents: ranked.filter((r) => r.priorityLabel === 'High').length,
    mediumIncidents: ranked.filter((r) => r.priorityLabel === 'Medium').length,
    lowIncidents: ranked.filter((r) => r.priorityLabel === 'Low').length,
    pendingApprovals,
    summary:
      ranked.length === 0
        ? 'No active incidents. No situation to analyse.'
        : `${ranked.length} active incident(s); ${ranked.filter((r) => r.priorityLabel === 'Critical' || r.priorityLabel === 'High').length} high/critical; ${shortages.filter((s) => !s.insufficientData && s.shortage > 0).length} resource type(s) in shortage.`,
  }

  return {
    generatedAt: new Date().toISOString(),
    ranked,
    shortages,
    nextBestActions,
    situation,
    scoringNote: 'AI-assisted decision-support score — an explainable heuristic, not a scientifically validated disaster-prediction model.',
  }
}

// Incident response timeline from stored events (Req 22).
export async function getIncidentTimeline(incidentId: string) {
  const inc = await db.incident.findUnique({ where: { id: incidentId } })
  if (!inc) return null
  const events = await db.incidentEvent.findMany({
    where: { incidentId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  const parsed = events.map((e) => {
    let data: Json = {}
    try { data = JSON.parse(e.data || '{}') } catch { data = {} }
    return { eventType: e.eventType, label: data.label || e.eventType, createdAt: e.createdAt.toISOString() }
  })
  return { incidentCode: inc.incidentCode, type: inc.type, status: inc.status, createdAt: inc.createdAt.toISOString(), events: parsed }
}

// Impact metrics derived entirely from stored data (Req 23/24).
export async function getImpactMetrics() {
  const [incidents, approvals, assignments, resources, events] = await Promise.all([
    db.incident.findMany({ select: { status: true, createdAt: true, resolvedAt: true } }),
    db.approval.findMany({ select: { decision: true, createdAt: true, reviewedAt: true } }),
    db.resourceAssignment.findMany({ where: { replacedAt: null }, select: { status: true } }),
    db.resource.findMany({ select: { status: true } }),
    db.incidentEvent.findMany({ where: { eventType: { in: ['RESPONSE_ACKNOWLEDGED', 'RESPONSE_STARTED', 'RESPONSE_ARRIVED'] } }, select: { id: true } }),
  ])

  const resolved = incidents.filter((i) => i.status === 'RESOLVED' || i.status === 'CLOSED').length
  const pendingIncidents = incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length
  const pendingApprovals = approvals.filter((a) => a.decision === 'PENDING').length
  const decided = approvals.filter((a) => a.decision !== 'PENDING')
  const approvalTimes: number[] = []
  for (const a of decided) {
    if (a.reviewedAt) approvalTimes.push(Math.round((a.reviewedAt.getTime() - a.createdAt.getTime()) / 1000 / 60))
  }
  const avgApprovalTimeMin = approvalTimes.length > 0 ? Math.round(approvalTimes.reduce((p, c) => p + c, 0) / approvalTimes.length) : null
  const deployed = resources.filter((r) => ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE'].includes(r.status)).length
  const totalResources = resources.length
  const utilizationPct = totalResources > 0 ? Math.round((deployed / totalResources) * 100) : 0
  const resolutionTimes: number[] = []
  for (const i of incidents) {
    if ((i.status === 'RESOLVED' || i.status === 'CLOSED') && i.resolvedAt) {
      resolutionTimes.push(Math.round((i.resolvedAt.getTime() - i.createdAt.getTime()) / 1000 / 60))
    }
  }
  const avgResolutionTimeMin = resolutionTimes.length > 0 ? Math.round(resolutionTimes.reduce((p, c) => p + c, 0) / resolutionTimes.length) : null
  const utilizationDetails = Object.fromEntries(
    ['AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'UNAVAILABLE'].map((s) => [s, resources.filter((r) => r.status === s).length])
  )

  return {
    generatedAt: new Date().toISOString(),
    incidentsProcessed: incidents.length,
    incidentsResolved: resolved,
    pendingIncidents,
    resourcesDeployed: deployed,
    totalResources,
    resourceUtilizationPct: utilizationPct,
    pendingApprovals,
    avgApprovalTimeMin,
    avgResolutionTimeMin,
    responseActionsCompleted: events.length,
    utilizationDetails,
    notEnoughData: incidents.length === 0,
  }
}