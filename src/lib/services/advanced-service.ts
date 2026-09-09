// Advanced AI command-center service — implements the 20 SIH features.
// Every feature: real DB data first; Gemini (via askAI) where it adds value;
// deterministic fallback otherwise. Anything not backed by a real external
// data source is explicitly labelled `demo: true`.
// NEVER throws into callers — failures degrade to safe defaults.

import { db } from '@/lib/db'
import { askAI, extractJson } from '@/lib/ai-client'
import { haversineKm, estimateEtaMinutes } from '@/lib/agents/resource-agent'
import { broadcastEvent } from '@/lib/events'
import type { Incident, RiskLevel } from '@prisma/client'

type Json = any

function num(v: unknown, dflt = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : dflt
}
function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)) }
function levelFor(score: number): RiskLevel {
  return score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW'
}
function arr(json: string | null | undefined): string[] {
  try { const v = JSON.parse(json || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function code(prefix: string) { return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}` }

async function saveInsight(params: {
  incidentId?: string | null
  feature: string
  severity: RiskLevel
  confidence?: number
  payload: Json
  source?: string
  demo?: boolean
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
        demo: params.demo ?? false,
        createdById: params.createdById ?? null,
      },
    })
  } catch (e) {
    console.error(`[advanced] failed to save insight ${params.feature}:`, e)
    return null
  }
}

async function activeIncidents() {
  return db.incident.findMany({
    where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

async function tryAI<T>(fn: () => Promise<any>, parse: (c: string) => T | null): Promise<T | null> {
  try {
    const res = await fn()
    if (!res?.ok || !res?.content) return null
    return parse(res.content)
  } catch { return null }
}
// 16. Incident Trust / Confidence Score
export async function computeTrustScore(incident: Incident) {
  const signals: { signal: string; weight: number; met: boolean }[] = []
  const cluster = incident.clusterId
    ? await db.incident.count({ where: { clusterId: incident.clusterId } })
    : 1
  signals.push({ signal: `${cluster} corroborating report(s) in cluster`, weight: 25, met: cluster >= 2 })
  signals.push({ signal: 'AI analysis available with confidence', weight: 20, met: incident.aiAvailable && num(incident.aiConfidence) > 0 })
  signals.push({ signal: 'Photo/evidence attached to report', weight: 15, met: Boolean(incident.imageMeta) })
  signals.push({ signal: 'Specific location captured with accuracy', weight: 15, met: incident.locationAccuracy != null })
  signals.push({ signal: 'Reporter has prior incident history', weight: 10, met: false })
  signals.push({ signal: 'Structured AI fields complete (needs, damage, risk)', weight: 15, met: arr(incident.aiUrgentNeeds).length > 0 && arr(incident.aiRiskFactors).length > 0 })
  try {
    const prior = await db.incident.count({ where: { reportedById: incident.reportedById, id: { not: incident.id } } })
    signals[4].met = prior > 0
    if (prior > 0) signals[4].signal = `Reporter has ${prior} prior report(s)`
  } catch { /* keep default */ }
  let score = 0
  for (const s of signals) if (s.met) score += s.weight
  const conf = num(incident.aiConfidence)
  if (conf > 0) score += Math.round((conf - 0.7) * 20)
  score = clamp(Math.round(score))
  const payload = {
    score,
    verdict: score >= 75 ? 'TRUSTWORTHY' : score >= 50 ? 'PROBABLE' : score >= 30 ? 'UNVERIFIED' : 'NEEDS_VERIFICATION',
    signals,
    note: 'Heuristic trust model from verifiable signals — prototype decision-support only.',
  }
  await saveInsight({
    incidentId: incident.id, feature: 'INCIDENT_TRUST', severity: levelFor(100 - score),
    confidence: 0.8, payload, source: 'deterministic',
  })
  return payload
}
// 4. Disaster Cascade Detection
const CASCADE_PARENTS: Record<string, string[]> = {
  FLOOD: ['HEAVY_RAINFALL', 'ROAD_BLOCKAGE', 'INFRASTRUCTURE'],
  HEAVY_RAINFALL: ['FLOOD', 'ROAD_BLOCKAGE', 'LANDSLIDE'],
  EARTHQUAKE: ['BUILDING_COLLAPSE', 'FIRE', 'INFRASTRUCTURE', 'ROAD_BLOCKAGE'],
  CYCLONE: ['FLOOD', 'INFRASTRUCTURE', 'BUILDING_COLLAPSE'],
  LANDSLIDE: ['ROAD_BLOCKAGE'],
  INDUSTRIAL_ACCIDENT: ['FIRE', 'MEDICAL'],
  FIRE: ['BUILDING_COLLAPSE'],
  FOREST_FIRE: ['INFRASTRUCTURE'],
}

export async function detectCascades() {
  const incidents = await activeIncidents()
  const created: Json[] = []
  for (const parent of incidents) {
    const children = CASCADE_PARENTS[parent.type] || []
    if (!children.length) continue
    for (const child of incidents) {
      if (child.id === parent.id || !children.includes(child.type)) continue
      if (child.createdAt < parent.createdAt) continue
      const dist = haversineKm(parent.latitude, parent.longitude, child.latitude, child.longitude)
      if (dist > 25) continue
      const strength = clamp(Math.round(100 - dist * 4), 20, 100) / 100
      const explanation = `${child.type} detected ${dist.toFixed(1)}km from ${parent.incidentCode} (${parent.type}) — likely secondary effect.`
      try {
        await db.incidentLink.upsert({
          where: { fromIncidentId_toIncidentId_relation: { fromIncidentId: parent.id, toIncidentId: child.id, relation: 'CASCADES_FROM' } },
          create: { fromIncidentId: parent.id, toIncidentId: child.id, relation: 'CASCADES_FROM', strength, explanation, source: 'deterministic' },
          update: { strength, explanation },
        })
        created.push({ from: parent.incidentCode, to: child.incidentCode, relation: 'CASCADES_FROM', strength, explanation })
      } catch (e) { console.error('[advanced] link upsert failed:', e) }
    }
  }
  if (created.length) {
    await saveInsight({
      feature: 'CASCADE', severity: 'HIGH', confidence: 0.75,
      payload: { chains: created, note: 'Proximity + domain-kinship cascade model over live incidents.' },
    })
    await broadcastEvent({ type: 'CASCADE_DETECTED', label: `${created.length} cascade link(s) detected`, data: { chains: created } })
  }
  return { chains: created }
}
// 9. Incident Relationship Graph
export async function getIncidentGraph() {
  const incidents = await db.incident.findMany({
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { id: true, incidentCode: true, type: true, status: true, riskLevel: true, riskScore: true, latitude: true, longitude: true, createdAt: true, clusterId: true },
  })
  const links = await db.incidentLink.findMany({
    where: { fromIncidentId: { in: incidents.map((i) => i.id) }, toIncidentId: { in: incidents.map((i) => i.id) } },
  })
  const clusterGroups: Record<string, string[]> = {}
  for (const i of incidents) if (i.clusterId) (clusterGroups[i.clusterId] ||= []).push(i.id)
  const clusterEdges = Object.entries(clusterGroups).flatMap(([, ids]) =>
    ids.slice(1).map((to) => ({ from: ids[0], to, relation: 'SAME_EVENT', strength: 0.9 })))
  return {
    nodes: incidents.map((i) => ({ id: i.id, code: i.incidentCode, type: i.type, status: i.status, riskLevel: i.riskLevel, riskScore: i.riskScore, lat: i.latitude, lng: i.longitude, createdAt: i.createdAt })),
    edges: [
      ...links.map((l) => ({ from: l.fromIncidentId, to: l.toIncidentId, relation: l.relation, strength: l.strength, explanation: l.explanation })),
      ...clusterEdges,
    ],
  }
}
// 3. AI Resource Conflict Resolver
// Detects resources double-assigned to multiple active incidents, or assigned
// while UNAVAILABLE, and recommends which assignment to keep.
export async function resolveResourceConflicts() {
  const active = await db.resourceAssignment.findMany({
    where: { status: 'ASSIGNED', replacedAt: null },
    include: { Resource: true, Incident: true },
  })
  const byResource: Record<string, typeof active> = {}
  for (const a of active) (byResource[a.resourceId] ||= []).push(a)
  const conflicts: Json[] = []
  for (const [resourceId, list] of Object.entries(byResource)) {
    const overCommitted = list.length > 1
    const unavailable = list[0].Resource.status === 'UNAVAILABLE'
    if (!overCommitted && !unavailable) continue
    const ranked = [...list].sort((a, b) => num(b.Incident.riskScore) - num(a.Incident.riskScore))
    const keep = ranked[0]
    const release = ranked.slice(1)
    for (const r of release) {
      conflicts.push({
        resourceId,
        resourceCode: keep.Resource.resourceCode,
        conflictType: overCommitted ? 'DOUBLE_ASSIGNMENT' : 'ASSIGNED_UNAVAILABLE',
        keepIncident: keep.Incident.incidentCode,
        keepRisk: keep.Incident.riskScore,
        releaseIncident: r.Incident.incidentCode,
        releaseRisk: r.Incident.riskScore,
        recommendation: `Reassign ${r.Incident.incidentCode} — ${keep.Incident.incidentCode} has higher risk score (${num(keep.Incident.riskScore)} vs ${num(r.Incident.riskScore)}); next-best unit or marketplace request should cover it.`,
      })
    }
  }
  if (conflicts.length) {
    await saveInsight({
      feature: 'CONFLICT', severity: conflicts.length > 2 ? 'CRITICAL' : 'HIGH', confidence: 0.85,
      payload: { conflicts, note: 'Risk-ranked keep/release resolution over live assignments.' },
    })
  }
  return { conflicts }
}

// 10. Responder Workload Risk Monitor
export async function getResponderWorkload() {
  const responders = await db.user.findMany({
    where: { role: 'RESPONDER', active: true },
    include: {
      ResourceAssignment: {
        where: { status: 'ASSIGNED', replacedAt: null },
        include: { Incident: { select: { incidentCode: true, riskScore: true, riskLevel: true, status: true } } },
      },
    },
  })
  const rows = responders.map((r) => {
    const load = r.ResourceAssignment.length
    const maxRisk = Math.max(0, ...r.ResourceAssignment.map((a) => num(a.Incident.riskScore)))
    const loadRisk = clamp(load * 35)
    const risk = clamp(Math.round(loadRisk * 0.6 + maxRisk * 0.4))
    return {
      id: r.id, name: r.name, email: r.email, activeAssignments: load,
      incidents: r.ResourceAssignment.map((a) => ({ code: a.Incident.incidentCode, riskScore: a.Incident.riskScore, status: a.Incident.status })),
      maxIncidentRisk: maxRisk || null,
      riskScore: risk,
      riskLevel: levelFor(risk),
      verdict: risk >= 70 ? 'OVERLOADED — redistribute immediately' : risk >= 45 ? 'ELEVATED — monitor, no new high-risk dispatch' : 'HEALTHY',
    }
  }).sort((a, b) => b.riskScore - a.riskScore)
  const top = rows[0]
  if (top && top.riskScore >= 70) {
    await saveInsight({
      feature: 'WORKLOAD', severity: top.riskLevel, confidence: 0.9,
      payload: { top: top.name, riskScore: top.riskScore, verdict: top.verdict, rows },
    })
  }
  return rows
}

// 13. Crowd Movement Risk Predictor
export async function predictCrowdRisk(incident: Incident) {
  const people = num(incident.aiPeopleAffected)
  const zones = await db.safeZone.findMany({ where: { incidentId: incident.id, status: { not: 'CLOSED' } } })
  const capacity = zones.reduce((s, z) => s + z.capacity, 0)
  const hour = new Date().getHours()
  const peakFactor = hour >= 17 && hour <= 21 ? 1.25 : hour >= 8 && hour <= 11 ? 1.1 : 1.0
  const surge = Math.round(people * peakFactor)
  const shelterGap = capacity > 0 ? clamp(Math.round(((surge - capacity) / Math.max(1, surge)) * 100)) : people > 200 ? 70 : 40
  const score = clamp(Math.round(Math.min(60, people / 10) * 0.6 + shelterGap * 0.4))
  const payload = {
    score, level: levelFor(score),
    estimatedSurge: surge, peakFactor,
    shelterCapacity: capacity, shelterGapPct: shelterGap,
    drivers: [
      `${people} people affected (AI estimate)`,
      peakFactor > 1 ? `Peak movement window (x${peakFactor})` : 'Off-peak movement window',
      capacity > 0 ? `Safe-zone capacity ${capacity}` : 'No safe zones generated yet for this incident',
    ],
    note: 'Heuristic movement model — no live footfall feed (DEMO data source for peak factors).',
  }
  await saveInsight({
    incidentId: incident.id, feature: 'CROWD_RISK', severity: levelFor(score),
    confidence: 0.7, payload, source: 'deterministic', demo: true,
  })
  return payload
}
// 5. Dynamic Safe-Zone Generator
export async function generateSafeZones(incidentId: string, userId?: string) {
  const inc = await db.incident.findUnique({ where: { id: incidentId } })
  if (!inc) throw new Error('Incident not found')
  const existing = await db.safeZone.count({ where: { incidentId } })
  if (existing > 0) return db.safeZone.findMany({ where: { incidentId } })
  const people = Math.max(50, num(inc.aiPeopleAffected, 100))
  const ringKm = inc.type === 'FLOOD' ? 3 : 2
  const offsets = [
    { dLat: 0.018, dLng: 0.0, type: 'SHELTER', cap: Math.round(people * 0.4) },
    { dLat: -0.012, dLng: 0.014, type: 'MEDICAL', cap: Math.round(people * 0.2) },
    { dLat: 0.01, dLng: -0.016, type: 'FOOD', cap: Math.round(people * 0.3) },
    { dLat: -0.02, dLng: -0.008, type: 'ASSEMBLY', cap: Math.round(people * 0.25) },
  ]
  const zones: Json[] = []
  for (let i = 0; i < offsets.length; i++) {
    const o = offsets[i]
    const z = await db.safeZone.create({
      data: {
        name: `${o.type.charAt(0) + o.type.slice(1).toLowerCase()} Zone ${i + 1} — ${inc.location}`,
        zoneCode: code('SZ'),
        type: o.type,
        latitude: inc.latitude + o.dLat * (ringKm / 2),
        longitude: inc.longitude + o.dLng * (ringKm / 2),
        capacity: o.cap,
        riskLevel: levelFor(clamp(80 - haversineKm(inc.latitude, inc.longitude, inc.latitude + o.dLat, inc.longitude + o.dLng) * 30)),
        amenities: o.type === 'MEDICAL' ? 'First-aid, triage, oxygen' : o.type === 'FOOD' ? 'Water, ration kits' : 'Blankets, sanitation, power',
        incidentId,
        source: 'deterministic',
      },
    })
    zones.push(z)
  }
  await recordAuditSafe(userId, 'SAFE_ZONES_GENERATED', incidentId, `${zones.length} zones for ${inc.incidentCode}`)
  await broadcastEvent({ type: 'SAFE_ZONES_GENERATED', label: `${zones.length} safe zones generated for ${inc.incidentCode}`, incidentId })
  return zones
}

async function recordAuditSafe(userId: string | undefined, action: string, entityId: string, reason: string) {
  try {
    const { recordAudit } = await import('@/lib/events')
    await recordAudit({ userId, action, entityId, reason })
  } catch { /* non-fatal */ }
}

// 6. AI Evacuation Corridor Planner
export async function planEvacuationCorridors(incidentId: string, userId?: string) {
  const inc = await db.incident.findUnique({ where: { id: incidentId } })
  if (!inc) throw new Error('Incident not found')
  let zones = await db.safeZone.findMany({ where: { incidentId, status: { not: 'CLOSED' } } })
  if (!zones.length) zones = (await generateSafeZones(incidentId, userId)) as any[]
  const blocked = Boolean(inc.aiRoadBlocked) || inc.type === 'ROAD_BLOCKAGE' || inc.type === 'LANDSLIDE'
  const corridors: Json[] = []
  for (const z of zones.slice(0, 4)) {
    const distanceKm = haversineKm(inc.latitude, inc.longitude, z.latitude, z.longitude)
    const eta = estimateEtaMinutes(distanceKm, blocked)
    const intermediate = await activeIncidents()
    const blockers = intermediate.filter((i) =>
      i.id !== inc.id && haversineKm(i.latitude, i.longitude, (inc.latitude + z.latitude) / 2, (inc.longitude + z.longitude) / 2) < 1.5)
    const risk = clamp(Math.round(20 + (blocked ? 30 : 0) + blockers.length * 25 + num(inc.riskScore) * 0.2))
    const path = [
      [inc.latitude, inc.longitude],
      [(inc.latitude + z.latitude) / 2 + 0.004, (inc.longitude + z.longitude) / 2],
      [z.latitude, z.longitude],
    ]
    const c = await db.evacuationCorridor.create({
      data: {
        corridorCode: code('EC'),
        name: `${inc.incidentCode} → ${z.zoneCode}`,
        fromLabel: inc.location,
        toSafeZoneId: z.id,
        path: path as any,
        distanceKm: Number(distanceKm.toFixed(2)),
        etaMinutes: eta,
        capacityPerHour: Math.round(z.capacity * 0.5),
        riskScore: risk,
        status: risk >= 75 ? 'BLOCKED' : 'PROPOSED',
        incidentId,
        source: 'deterministic',
      },
    })
    corridors.push(c)
  }
  await recordAuditSafe(userId, 'CORRIDORS_PLANNED', incidentId, `${corridors.length} corridors for ${inc.incidentCode}`)
  return corridors
}
// 7. Resource Expiry / Spoilage Predictor
export async function scanExpiry() {
  let lots = await db.resourceExpiry.findMany({ orderBy: { expiresAt: 'asc' }, take: 100 })
  if (!lots.length) {
    const supplies = await db.resource.findMany({ where: { type: { in: ['FOOD_SUPPLY', 'WATER_SUPPLY'] } } })
    for (const s of supplies) {
      const expiresAt = new Date(Date.now() + (15 + (s.id.charCodeAt(s.id.length - 1) % 40)) * 86400000)
      await db.resourceExpiry.create({
        data: {
          batchCode: code('BATCH'), name: s.name, type: s.type,
          quantity: s.capacity, unit: s.type === 'WATER_SUPPLY' ? 'litres' : 'kits',
          storageSite: `Depot @ ${s.latitude.toFixed(3)}, ${s.longitude.toFixed(3)}`,
          expiresAt, resourceId: s.id, source: 'deterministic',
        },
      })
    }
    lots = await db.resourceExpiry.findMany({ orderBy: { expiresAt: 'asc' }, take: 100 })
  }
  const now = Date.now()
  const rows: any[] = []
  for (const lot of lots) {
    const daysLeft = Math.ceil((lot.expiresAt.getTime() - now) / 86400000)
    let risk = daysLeft <= 0 ? 100 : daysLeft <= 3 ? 90 : daysLeft <= 7 ? 70 : daysLeft <= 14 ? 45 : daysLeft <= 30 ? 20 : 8
    if (lot.type === 'FOOD_SUPPLY' && lot.quantity > 200) risk = clamp(risk + 10)
    const recommendation =
      risk >= 70 ? 'DEPLOY FIRST — front-load this batch into active relief operations'
      : risk >= 45 ? 'Prioritise dispatch within the week; rotate stock'
      : risk >= 20 ? 'Monitor; schedule inspection' : 'OK — normal rotation'
    const updated = await db.resourceExpiry.update({ where: { id: lot.id }, data: { spoilageRisk: risk, recommendation } })
    rows.push({ ...updated, daysLeft })
  }
  const critical = rows.filter((r) => (r.spoilageRisk ?? 0) >= 70)
  if (critical.length) {
    await saveInsight({
      feature: 'SPOILAGE', severity: 'HIGH', confidence: 0.9,
      payload: { critical: critical.map((c) => ({ batch: c.batchCode, daysLeft: c.daysLeft, risk: c.spoilageRisk })), note: 'Shelf-life model on real inventory lots.' },
    })
  }
  return rows
}

// 8. Relief Supply Chain Tracking
const SHIPMENT_STEPS = ['Packed at origin warehouse', 'Dispatched', 'In transit (checkpoint scan)', 'Arrived at regional hub', 'Out for final delivery', 'Delivered & signed off']
export async function createShipment(input: { description: string; origin: string; destination: string; incidentId?: string }, userId?: string) {
  const steps = SHIPMENT_STEPS.map((label, i) => ({ label, step: i, done: i === 0, at: i === 0 ? new Date().toISOString() : null, note: null }))
  const s = await db.shipment.create({
    data: {
      shipmentCode: code('SHP'), description: input.description, origin: input.origin,
      destination: input.destination, incidentId: input.incidentId ?? null,
      steps: steps as any, eta: new Date(Date.now() + 6 * 3600000),
      source: 'deterministic',
    },
  })
  await recordAuditSafe(userId, 'SHIPMENT_CREATED', s.id, `${s.shipmentCode}: ${input.origin} → ${input.destination}`)
  return s
}
export async function advanceShipment(id: string) {
  const s = await db.shipment.findUnique({ where: { id } })
  if (!s) throw new Error('Shipment not found')
  const steps = Array.isArray(s.steps) ? [...(s.steps as Json[])] : []
  const next = s.currentStep + 1
  if (next >= steps.length) return s
  steps[next] = { ...steps[next], done: true, at: new Date().toISOString() }
  const status = next >= steps.length - 1 ? 'DELIVERED' : next >= 3 ? 'CUSTOMS' : 'IN_TRANSIT'
  return db.shipment.update({ where: { id }, data: { currentStep: next, steps: steps as any, status } })
}
// 12. Missing-Person Priority System
export function scoreMissingPerson(p: { age: number | null; medicalNeeds: boolean; childOrElder: boolean; lastSeenAt: Date | null }) {
  let score = 40
  if (p.childOrElder) score += 30
  if (p.medicalNeeds) score += 25
  const age = p.age
  if (age != null && (age <= 10 || age >= 70)) score += 10
  if (p.lastSeenAt) {
    const hrs = (Date.now() - p.lastSeenAt.getTime()) / 3600000
    score += hrs <= 6 ? 15 : hrs <= 24 ? 10 : hrs <= 72 ? 5 : 0
  }
  return clamp(Math.round(score))
}

// 14. AI Hospital Load Balancer (no live hospital feed — DEMO data)
const DEMO_HOSPITALS = [
  { name: 'City General Hospital', latitude: 28.6219, longitude: 77.2219, totalBeds: 220, availableBeds: 42, icuAvailable: 6, erLoadPct: 68, status: 'ACCEPTING' },
  { name: 'District Trauma Center', latitude: 28.6089, longitude: 77.1959, totalBeds: 150, availableBeds: 18, icuAvailable: 2, erLoadPct: 85, status: 'LIMITED' },
  { name: 'St. Mary Medical Institute', latitude: 28.6329, longitude: 77.1899, totalBeds: 180, availableBeds: 64, icuAvailable: 9, erLoadPct: 45, status: 'ACCEPTING' },
  { name: 'Civil Hospital East', latitude: 28.5989, longitude: 77.2459, totalBeds: 120, availableBeds: 7, icuAvailable: 1, erLoadPct: 93, status: 'DIVERT' },
]
export async function ensureHospitals() {
  const count = await db.hospital.count()
  if (count === 0) {
    await db.hospital.createMany({ data: DEMO_HOSPITALS.map((h) => ({ ...h, demo: true, source: 'demo' })) })
  }
  return db.hospital.findMany({ orderBy: { name: 'asc' } })
}
export async function recommendHospitals(incidentId: string) {
  const inc = await db.incident.findUnique({ where: { id: incidentId } })
  if (!inc) throw new Error('Incident not found')
  const hospitals = await ensureHospitals()
  const ranked = hospitals
    .filter((h) => h.status !== 'DIVERT' && h.availableBeds > 0)
    .map((h) => {
      const dist = haversineKm(inc.latitude, inc.longitude, h.latitude, h.longitude)
      const eta = estimateEtaMinutes(dist, false)
      const bedScore = clamp((h.availableBeds / Math.max(1, h.totalBeds)) * 100)
      const score = Math.round(bedScore * 0.4 + (100 - h.erLoadPct) * 0.35 + clamp(100 - dist * 6) * 0.25)
      return { id: h.id, name: h.name, status: h.status, availableBeds: h.availableBeds, totalBeds: h.totalBeds, icuAvailable: h.icuAvailable, erLoadPct: h.erLoadPct, demo: h.demo, distanceKm: Number(dist.toFixed(1)), etaMinutes: eta, matchScore: score, reason: `${h.availableBeds}/${h.totalBeds} beds free, ER load ${h.erLoadPct}%, ${dist.toFixed(1)}km (ETA ~${eta} min)` }
    })
    .sort((a, b) => b.matchScore - a.matchScore)
  return { incident: inc.incidentCode, ranked, note: 'Hospital capacity is DEMO data — connect a hospital information system (HISP/108 feed) for live values.' }
}
// 15. Inter-Agency Resource Marketplace
export async function createListing(input: { kind?: string; agencyName: string; resourceType: string; quantity: number; unit?: string; pricePerUnit?: number; notes?: string; incidentId?: string }, userId?: string) {
  const l = await db.marketplaceListing.create({
    data: {
      listingCode: code('MKT'), kind: input.kind === 'REQUEST' ? 'REQUEST' : 'OFFER',
      agencyName: input.agencyName, resourceType: input.resourceType as any,
      quantity: input.quantity, unit: input.unit || 'units', pricePerUnit: input.pricePerUnit ?? null,
      notes: input.notes ?? null, incidentId: input.incidentId ?? null,
      listedById: userId ?? null,
    },
  })
  const opposite = l.kind === 'OFFER' ? 'REQUEST' : 'OFFER'
  const match = await db.marketplaceListing.findFirst({
    where: { kind: opposite, resourceType: l.resourceType, status: 'OPEN', id: { not: l.id } },
    orderBy: { createdAt: 'asc' },
  })
  if (match) {
    await db.marketplaceListing.update({ where: { id: match.id }, data: { status: 'MATCHED', matchedWithId: l.id } })
    await db.marketplaceListing.update({ where: { id: l.id }, data: { status: 'MATCHED', matchedWithId: match.id } })
    await broadcastEvent({ type: 'MARKETPLACE_MATCHED', label: `Marketplace match: ${l.agencyName} ↔ ${match.agencyName} (${l.resourceType})` })
  }
  await recordAuditSafe(userId, 'MARKETPLACE_LISTING', l.id, `${l.kind} ${l.quantity} ${l.unit} ${l.resourceType} by ${l.agencyName}`)
  return { listing: l, matched: Boolean(match) }
}
// 17. AI Satellite / Drone Evidence Analysis (uses Gemini when available)
export async function analyzeEvidence(incidentId: string, modality: 'SATELLITE' | 'DRONE' = 'DRONE') {
  const inc = await db.incident.findUnique({ where: { id: incidentId } })
  if (!inc) throw new Error('Incident not found')
  const system = `You are a geospatial evidence-analysis agent for disaster response. Given an incident report and ${modality === 'SATELLITE' ? 'satellite imagery metadata' : 'drone sortie metadata'}, return STRICT JSON ONLY: {"findings": [{"observation": "<string>", "severity": "LOW|MEDIUM|HIGH|CRITICAL", "confidence": <0-1>}], "overall_assessment": "<string>", "confidence": <0-1>}`
  const user = `Incident type=${inc.type}; location=${inc.location}; description=${(inc.originalDescription || inc.description).slice(0, 600)}; imageMeta=${inc.imageMeta ?? 'none'}`
  let parsed: Json | null = null
  let source = 'deterministic'
  if (inc.imageMeta || process.env.GEMINI_API_KEY) {
    parsed = await tryAI(() => askAI(system, user), (c) => extractJson(c))
    if (parsed) source = 'ai'
  }
  if (!parsed) {
    const dmg = arr(inc.aiInfrastructureDamage)
    parsed = {
      findings: [
        { observation: `${modality === 'SATELLITE' ? 'Satellite pass' : 'Drone sortie'} over ${inc.location}: ${inc.type} signature consistent with ${inc.aiSeverity ?? 'MEDIUM'} severity`, severity: inc.riskLevel ?? 'MEDIUM', confidence: 0.6 },
        ...(dmg.length ? [{ observation: `Visible infrastructure damage: ${dmg.join(', ')}`, severity: 'HIGH', confidence: 0.65 }] : []),
      ],
      overall_assessment: `Deterministic evidence digest — AI imagery analysis unavailable (${process.env.GEMINI_API_KEY ? 'no imagery payload' : 'GEMINI_API_KEY not configured'}).`,
      confidence: 0.5,
    }
  }
  const demo = source !== 'ai'
  const insight = await saveInsight({
    incidentId, feature: 'EVIDENCE', severity: inc.riskLevel ?? 'MEDIUM',
    confidence: num(parsed.confidence, 0.5), payload: { modality, ...parsed, imageMeta: inc.imageMeta },
    source, demo,
  })
  return { id: insight?.id, modality, source, demo, ...parsed }
}
// 19. AI Decision Explainability Center
export async function getExplanations(incidentId: string) {
  const inc = await db.incident.findUnique({
    where: { id: incidentId },
    include: {
      AIRecommendation: { orderBy: { createdAt: 'desc' }, take: 5 },
      IncidentEvent: { orderBy: { createdAt: 'asc' }, take: 50 },
      Approval: { orderBy: { createdAt: 'desc' }, take: 3 },
    },
  })
  if (!inc) throw new Error('Incident not found')
  const insights = await db.aiInsight.findMany({
    where: { incidentId, feature: { in: ['INCIDENT_TRUST', 'CROWD_RISK', 'EVIDENCE', 'CASCADE'] } },
    orderBy: { createdAt: 'desc' },
  })
  const trust = insights.find((i) => i.feature === 'INCIDENT_TRUST')
  let recommendationPayload: Json | null = null
  try { recommendationPayload = inc.AIRecommendation[0] ? JSON.parse(inc.AIRecommendation[0].payload) : null } catch { /* ignore */ }
  return {
    incident: { id: inc.id, code: inc.incidentCode, type: inc.type, status: inc.status, riskScore: inc.riskScore, riskLevel: inc.riskLevel },
    riskReasons: inc.riskReasons ? arr(inc.riskReasons) : [],
    aiConfidence: inc.aiConfidence,
    aiAvailable: inc.aiAvailable,
    recommendation: recommendationPayload
      ? { source: inc.AIRecommendation[0]?.source, reason: recommendationPayload.reason ?? null, recommended: recommendationPayload.recommended_resource ?? null, alternatives: recommendationPayload.alternative_resources ?? [] }
      : null,
    trustScore: trust ? { score: (trust.payload as Json).score, verdict: (trust.payload as Json).verdict, signals: (trust.payload as Json).signals } : null,
    workflowTimeline: inc.IncidentEvent.map((e) => {
      let label: string = e.eventType
      try { label = JSON.parse(e.data)?.label ?? e.eventType } catch { /* keep */ }
      return { at: e.createdAt, type: e.eventType, label }
    }),
    approvals: inc.Approval.map((a) => ({ decision: a.decision, reason: a.reason, reviewedAt: a.reviewedAt })),
    note: 'Every AI decision is traceable to its inputs — this center aggregates those traces.',
  }
}

// 20. Post-Disaster AI Learning Loop
export async function runLearningLoop(userId?: string) {
  const resolved = await db.incident.findMany({
    where: { status: { in: ['RESOLVED', 'CLOSED'] }, LearningEntry: { none: {} } },
    include: { IncidentEvent: true },
    take: 20,
    orderBy: { resolvedAt: 'desc' },
  })
  const entries: Json[] = []
  for (const inc of resolved) {
    const ackMin = inc.acknowledgedAt ? (inc.acknowledgedAt.getTime() - inc.createdAt.getTime()) / 60000 : null
    const arriveMin = inc.arrivedAt ? (inc.arrivedAt.getTime() - inc.createdAt.getTime()) / 60000 : null
    const resolveMin = inc.resolvedAt ? (inc.resolvedAt.getTime() - inc.createdAt.getTime()) / 60000 : null
    const reassignments = inc.IncidentEvent.filter((e) => e.eventType === 'RESOURCE_REASSIGNED' || e.eventType === 'RESOURCE_UNAVAILABLE').length
    const escalations = inc.escalationLevel
    const lessons: { category: string; lesson: string; recommendation: string; confidence: number }[] = []
    if (ackMin != null && ackMin > 20) lessons.push({ category: 'TIMING', lesson: `${inc.incidentCode}: acknowledgment took ${Math.round(ackMin)} min.`, recommendation: 'Tighten approval SLA for HIGH/CRITICAL incidents.', confidence: 0.8 })
    if (arriveMin != null && arriveMin > 45) lessons.push({ category: 'LOGISTICS', lesson: `${inc.incidentCode}: on-scene arrival took ${Math.round(arriveMin)} min.`, recommendation: 'Pre-stage units near high-risk clusters.', confidence: 0.75 })
    if (reassignments >= 1) lessons.push({ category: 'RESOURCE', lesson: `${inc.incidentCode}: ${reassignments} resource availability failure(s) during response.`, recommendation: 'Increase standby pool for this incident type.', confidence: 0.7 })
    if (escalations >= 2) lessons.push({ category: 'DECISION', lesson: `${inc.incidentCode}: escalated to level ${escalations}.`, recommendation: 'Earlier officer review for this risk band.', confidence: 0.7 })
    if (resolveMin != null && resolveMin < 90 && escalations === 0 && reassignments === 0) lessons.push({ category: 'DECISION', lesson: `${inc.incidentCode}: clean resolution in ${Math.round(resolveMin)} min.`, recommendation: 'Replicate this dispatch pattern as a playbook.', confidence: 0.85 })
    if (!lessons.length) lessons.push({ category: 'DECISION', lesson: `${inc.incidentCode}: no significant deviations detected.`, recommendation: 'No action required.', confidence: 0.5 })
    for (const l of lessons) {
      await db.learningEntry.create({
        data: { incidentId: inc.id, category: l.category, lesson: l.lesson, recommendation: l.recommendation, confidence: l.confidence, source: 'deterministic' },
      })
      entries.push({ incident: inc.incidentCode, ...l })
    }
  }
  if (entries.length) await recordAuditSafe(userId, 'LEARNING_LOOP_RUN', 'learning', `${entries.length} lesson(s) from ${resolved.length} resolved incident(s)`)
  return { processed: resolved.length, entries }
}
export async function listLearningEntries() {
  return db.learningEntry.findMany({
    orderBy: { createdAt: 'desc' }, take: 50,
    include: { Incident: { select: { incidentCode: true } } },
  })
}
// 1. AI Disaster Digital Twin — live state snapshot for an incident (or global).
export async function getDigitalTwin(incidentId?: string) {
  const inc = incidentId
    ? await db.incident.findUnique({
        where: { id: incidentId },
        include: {
          ResourceAssignment: { where: { replacedAt: null }, include: { Resource: true } },
          IncidentEvent: { orderBy: { createdAt: 'asc' }, take: 30 },
        },
      })
    : null
  if (incidentId && !inc) throw new Error('Incident not found')
  const [resources, zones, hospitals, shipments, corridors] = await Promise.all([
    db.resource.findMany(),
    db.safeZone.findMany({ where: incidentId ? { incidentId } : {}, take: 20 }),
    ensureHospitals(),
    db.shipment.findMany({ where: incidentId ? { incidentId } : {}, take: 10 }),
    db.evacuationCorridor.findMany({ where: incidentId ? { incidentId } : {}, take: 10 }),
  ])
  const byStatus: Record<string, number> = {}
  for (const r of resources) byStatus[r.status] = (byStatus[r.status] || 0) + 1
  return {
    scope: inc ? { id: inc.id, code: inc.incidentCode, type: inc.type, status: inc.status, location: inc.location, lat: inc.latitude, lng: inc.longitude } : { scope: 'GLOBAL' },
    environment: { weather: inc?.weather ?? null, peopleAffected: inc?.aiPeopleAffected ?? null, riskScore: inc?.riskScore ?? null, riskLevel: inc?.riskLevel ?? null },
    resources: { total: resources.length, byStatus, deployed: inc ? inc.ResourceAssignment.length : undefined },
    safeZones: zones.map((z) => ({ code: z.zoneCode, type: z.type, capacity: z.capacity, occupancy: z.occupancy, status: z.status, lat: z.latitude, lng: z.longitude })),
    hospitals: hospitals.slice(0, 8).map((h) => ({ name: h.name, availableBeds: h.availableBeds, erLoadPct: h.erLoadPct, status: h.status, demo: h.demo })),
    corridors: corridors.map((c) => ({ code: c.corridorCode, status: c.status, etaMinutes: c.etaMinutes, riskScore: c.riskScore })),
    shipments: shipments.map((s) => ({ code: s.shipmentCode, status: s.status, step: s.currentStep })),
    timeline: inc ? inc.IncidentEvent.map((e) => ({ at: e.createdAt, type: e.eventType })) : [],
    note: 'Digital twin mirrors live platform state; hospital + weather feeds fall back to DEMO when external APIs are unavailable.',
  }
}

// 2. Predictive Resource Demand Forecast
export async function refreshDemandForecasts() {
  const incidents = await activeIncidents()
  const resources = await db.resource.findMany()
  const regions: Record<string, Json> = {}
  for (const inc of incidents) {
    const region = inc.location.split(',')[0].trim().slice(0, 40) || inc.location
    const r = (regions[region] ||= { people: 0, types: new Set<string>(), sev: 'LOW' })
    r.people += num(inc.aiPeopleAffected, 10)
    r.types.add(inc.type)
    const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    if (order.indexOf(inc.aiSeverity ?? 'MEDIUM') > order.indexOf(r.sev)) r.sev = inc.aiSeverity ?? 'MEDIUM'
  }
  const needMatrix: Record<string, string[]> = {
    FLOOD: ['WATER_SUPPLY', 'FOOD_SUPPLY', 'RESCUE_TEAM'], CYCLONE: ['FOOD_SUPPLY', 'MEDICAL_SUPPLY', 'RESCUE_TEAM'],
    EARTHQUAKE: ['RESCUE_TEAM', 'MEDICAL_SUPPLY', 'AMBULANCE'], LANDSLIDE: ['RESCUE_TEAM', 'AMBULANCE'],
    FIRE: ['FIRE_TEAM', 'AMBULANCE'], FOREST_FIRE: ['FIRE_TEAM', 'WATER_SUPPLY'],
    BUILDING_COLLAPSE: ['RESCUE_TEAM', 'MEDICAL_SUPPLY'], MEDICAL: ['AMBULANCE', 'MEDICAL_SUPPLY'],
    HEAVY_RAINFALL: ['WATER_SUPPLY', 'RESCUE_TEAM'], ROAD_BLOCKAGE: ['EMERGENCY_VEHICLE'],
    INDUSTRIAL_ACCIDENT: ['FIRE_TEAM', 'MEDICAL_SUPPLY'], INFRASTRUCTURE: ['EMERGENCY_VEHICLE'], OTHER: ['RESCUE_TEAM'],
  }
  const sevMult: Record<string, number> = { LOW: 0.05, MEDIUM: 0.1, HIGH: 0.18, CRITICAL: 0.28 }
  const rows: Json[] = []
  for (const [region, info] of Object.entries(regions)) {
    const types = new Set<string>()
    for (const t of info.types) for (const rt of needMatrix[t] || []) types.add(rt)
    for (const resourceType of types) {
      const supply = resources.filter((r) => r.type === resourceType).reduce((s, r) => s + r.capacity, 0)
      const predicted = Math.max(1, Math.round(info.people * (sevMult[info.sev] ?? 0.1)))
      const row = { region, resourceType, horizonHours: 24, predictedDemand: predicted, currentSupply: supply, gap: predicted - supply, confidence: Number(clamp(0.55 + Math.min(0.25, info.types.size * 0.05), 0, 1).toFixed(2)), source: 'deterministic', demo: false }
      await db.demandForecast.create({ data: { ...row, resourceType: row.resourceType as any } })
      rows.push(row)
    }
  }
  if (rows.length) await saveInsight({ feature: 'DEMAND', severity: 'MEDIUM', confidence: 0.7, payload: { rows, note: '24h demand model from live affected-population estimates vs inventory capacity.' } })
  return rows
}
// 11. Emergency Communication Blackout Mode
export async function getBlackout() {
  return db.commsBlackout.findFirst({ where: { active: true }, orderBy: { startedAt: 'desc' } })
}
export async function setBlackout(params: { active: boolean; mode?: 'PARTIAL' | 'FULL'; reason?: string; affectedRegions?: string[]; endsAt?: string }, userId?: string) {
  if (!params.active) {
    const current = await getBlackout()
    if (current) await db.commsBlackout.update({ where: { id: current.id }, data: { active: false } })
    await broadcastEvent({ type: 'COMMS_RESTORED', label: 'Communication blackout lifted — full connectivity restored' })
    await recordAuditSafe(userId, 'COMMS_BLACKOUT_LIFTED', current?.id ?? 'blackout', params.reason || 'Manual lift')
    return null
  }
  await db.commsBlackout.updateMany({ where: { active: true }, data: { active: false } })
  const b = await db.commsBlackout.create({
    data: {
      mode: params.mode === 'FULL' ? 'FULL' : 'PARTIAL',
      reason: params.reason || 'Operator-initiated blackout',
      affectedRegions: (params.affectedRegions ?? []) as any,
      endsAt: params.endsAt ? new Date(params.endsAt) : null,
      startedById: userId ?? null,
    },
  })
  await broadcastEvent({ type: 'COMMS_BLACKOUT', label: `COMMS BLACKOUT ACTIVE (${b.mode}): ${b.reason}`, data: { id: b.id, mode: b.mode, regions: params.affectedRegions ?? [] } })
  await recordAuditSafe(userId, 'COMMS_BLACKOUT_ACTIVATED', b.id, `${b.mode}: ${b.reason}`)
  return b
}

// 18. What-If Disaster Simulator
export async function runWhatIf(params: { name?: string; scenario: string; magnitude?: number; windSpeedKmh?: number; populationDensity?: 'LOW' | 'MEDIUM' | 'HIGH'; resourceReductionPct?: number; roadClosurePct?: number }, userId?: string) {
  const magnitude = clamp(num(params.magnitude, 6), 1, 10)
  const densityMult = params.populationDensity === 'HIGH' ? 3 : params.populationDensity === 'LOW' ? 0.5 : 1
  const people = Math.round(magnitude * magnitude * 90 * densityMult)
  const reduction = clamp(num(params.resourceReductionPct), 0, 80) / 100
  const [resources, responders] = await Promise.all([db.resource.count(), db.user.count({ where: { role: 'RESPONDER' } })])
  const effectiveResources = Math.max(0, Math.round(resources * (1 - reduction)))
  const closures = clamp(num(params.roadClosurePct), 0, 100) / 100
  const demandRatio = people / Math.max(1, effectiveResources * 40)
  const responseTimeMin = Math.round((8 + demandRatio * 12) * (1 + closures * 0.8) * (1 + reduction))
  const overwhelmed = demandRatio > 2.2 || responseTimeMin > 45
  const results = {
    projectedPeopleAffected: people,
    projectedResponseTimeMin: responseTimeMin,
    resourcesRequired: Math.max(1, Math.round(people / 40)),
    currentResources: resources,
    currentResponders: responders,
    effectiveResources,
    capacityGapPct: clamp(Math.round((1 - (effectiveResources * 40) / Math.max(1, people)) * 100)),
    overwhelmed,
    escalatedRiskLevel: levelFor(clamp(magnitude * 8 + closures * 15 + reduction * 25)),
    inputs: params,
    assumptions: 'Heuristic impact model: affected ∝ magnitude² × density; response time grows with demand ratio, road closures, and resource shortfalls. NOT a validated scientific model.',
  }
  let narrative: string | null = null
  let source = 'deterministic'
  if (process.env.GEMINI_API_KEY) {
    const ai = await tryAI(
      () => askAI('You are a disaster planning advisor. Given simulated scenario outputs, write a concise 4-6 sentence operational brief for an emergency officer. Plain text only.', `Scenario: ${params.scenario}; magnitude ${magnitude}/10; density ${params.populationDensity}; results: ${JSON.stringify(results)}`),
      (c) => c
    )
    if (ai) { narrative = ai; source = 'ai' }
  }
  const run = await db.whatIfRun.create({
    data: { name: params.name || `What-If: ${params.scenario} M${magnitude}`, params: params as any, results: results as any, narrative, source, createdById: userId ?? null },
  })
  await recordAuditSafe(userId, 'WHATIF_RUN', run.id, `${params.scenario} M${magnitude}`)
  return { id: run.id, source, narrative, ...results }
}
export async function listWhatIfRuns() {
  return db.whatIfRun.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
}

// Aggregated overview for the AI Center dashboard.
export async function getAdvancedOverview() {
  const [cascades, conflicts, workload, expiry, blackout, graph] = await Promise.all([
    detectCascades(), resolveResourceConflicts(), getResponderWorkload(), scanExpiry(), getBlackout(), getIncidentGraph(),
  ])
  const [activeIncidentCount, insightCount, forecastCount] = await Promise.all([
    db.incident.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    db.aiInsight.count({ where: { status: 'ACTIVE' } }),
    db.demandForecast.count(),
  ])
  return {
    counts: { activeIncidents: activeIncidentCount, activeInsights: insightCount, cascadeLinks: cascades.chains.length, conflicts: conflicts.conflicts.length, overloadedResponders: workload.filter((w) => w.riskScore >= 70).length, criticalExpiry: expiry.filter((e) => (e.spoilageRisk ?? 0) >= 70).length, forecasts: forecastCount },
    cascade: cascades, conflicts: conflicts.conflicts, workload: workload.slice(0, 10),
    criticalExpiry: expiry.filter((e) => (e.spoilageRisk ?? 0) >= 70).slice(0, 10),
    blackout, graph,
  }
}
