// AI Multi-Disaster Risk Forecast Service — decision-support heuristics.
// NOT a validated prediction model; forecasts are NOT guaranteed predictions.
// Simulated/demo-derived factors are labelled `demo: true`.

import { db } from '@/lib/db'
import type { RiskLevel } from '@prisma/client'
import { getWeatherCached } from '@/lib/services/weather-service'

export interface DisasterTypeDef {
  key: string
  label: string
  emoji: string
  baseScore: number
  windowHours: number
  hazardNote: string
}

export const DISASTER_TYPES: DisasterTypeDef[] = [
  { key: 'FLOOD', label: 'Flood', emoji: '💧', baseScore: 22, windowHours: 48, hazardNote: 'Riverine/flash flooding from rainfall, drainage and history.' },
  { key: 'EARTHQUAKE', label: 'Earthquake', emoji: '🌍', baseScore: 18, windowHours: 168, hazardNote: 'Seismic hazard from history. Exact time/epicentre/magnitude CANNOT be predicted.' },
  { key: 'CYCLONE', label: 'Cyclone', emoji: '🌀', baseScore: 12, windowHours: 72, hazardNote: 'Cyclone formation/landfall potential from wind, pressure and rainfall.' },
  { key: 'LANDSLIDE', label: 'Landslide', emoji: '⛰️', baseScore: 12, windowHours: 48, hazardNote: 'Slope instability from rainfall, terrain and historical slides.' },
  { key: 'HEAVY_RAINFALL', label: 'Heavy Rainfall', emoji: '🌧️', baseScore: 8, windowHours: 24, hazardNote: 'Short-duration intense rainfall from live weather data.' },
  { key: 'EXTREME_WEATHER', label: 'Extreme Weather', emoji: '⛈️', baseScore: 8, windowHours: 24, hazardNote: 'Severe storms, high winds and other extreme conditions.' },
  { key: 'WILDFIRE', label: 'Wildfire / Fire', emoji: '🔥', baseScore: 10, windowHours: 72, hazardNote: 'Fire spread potential from heat, dryness and incidents.' },
  { key: 'TSUNAMI', label: 'Tsunami', emoji: '🌊', baseScore: 4, windowHours: 24, hazardNote: 'Coastal risk. Official bulletins take precedence; no fake live warnings.' },
  { key: 'DROUGHT', label: 'Drought', emoji: '🏜️', baseScore: 8, windowHours: 720, hazardNote: 'Water scarcity from rainfall deficits and history.' },
  { key: 'HEATWAVE', label: 'Heatwave', emoji: '🌡️', baseScore: 8, windowHours: 120, hazardNote: 'Sustained extreme heat from temperature trends.' },
]

function levelFor(score: number): RiskLevel {
  return score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW'
}
function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, Math.round(n))) }
// Per-disaster resource demand model (units per 100 people at HIGH risk).
const NEEDS: Record<string, Array<[string, number]>> = {
  FLOOD: [['RESCUE_TEAM', 2], ['AMBULANCE', 1.5], ['BOAT', 3], ['MEDICAL_SUPPLY', 40], ['FOOD_SUPPLY', 200], ['WATER_SUPPLY', 300], ['SHELTER_CAP', 250]],
  CYCLONE: [['RESCUE_TEAM', 2], ['AMBULANCE', 1.5], ['MEDICAL_SUPPLY', 40], ['FOOD_SUPPLY', 250], ['WATER_SUPPLY', 300], ['SHELTER_CAP', 400]],
  EARTHQUAKE: [['RESCUE_TEAM', 3], ['AMBULANCE', 2.5], ['MEDICAL_SUPPLY', 60], ['SHELTER_CAP', 300], ['FIRE_TEAM', 1]],
  LANDSLIDE: [['RESCUE_TEAM', 2], ['AMBULANCE', 1.5], ['MEDICAL_SUPPLY', 30]],
  WILDFIRE: [['FIRE_TEAM', 2], ['AMBULANCE', 1], ['WATER_SUPPLY', 500]],
  HEAVY_RAINFALL: [['RESCUE_TEAM', 1], ['WATER_SUPPLY', 150]],
  EXTREME_WEATHER: [['RESCUE_TEAM', 1], ['AMBULANCE', 1], ['MEDICAL_SUPPLY', 20]],
  TSUNAMI: [['RESCUE_TEAM', 3], ['AMBULANCE', 2.5], ['MEDICAL_SUPPLY', 60], ['SHELTER_CAP', 400]],
  DROUGHT: [['WATER_SUPPLY', 800], ['FOOD_SUPPLY', 300], ['MEDICAL_SUPPLY', 20]],
  HEATWAVE: [['WATER_SUPPLY', 500], ['MEDICAL_SUPPLY', 40], ['SHELTER_CAP', 200]],
}
// Known secondary-effect chains (AI Cascade Risk Engine knowledge base).
const CASCADES: Record<string, string[]> = {
  FLOOD: ['ROAD_BLOCKAGE', 'MEDICAL', 'INFRASTRUCTURE', 'DISEASE_OUTBREAK'],
  EARTHQUAKE: ['BUILDING_COLLAPSE', 'FIRE', 'ROAD_BLOCKAGE', 'MEDICAL'],
  CYCLONE: ['FLOOD', 'INFRASTRUCTURE', 'POWER_FAILURE', 'SHELTER_DEMAND'],
  LANDSLIDE: ['ROAD_BLOCKAGE', 'MEDICAL'],
  WILDFIRE: ['MEDICAL', 'INFRASTRUCTURE', 'AIR_QUALITY'],
  HEAVY_RAINFALL: ['FLOOD', 'ROAD_BLOCKAGE', 'LANDSLIDE'],
  EXTREME_WEATHER: ['POWER_FAILURE', 'ROAD_BLOCKAGE', 'MEDICAL'],
  TSUNAMI: ['FLOOD', 'INFRASTRUCTURE', 'MEDICAL'],
  DROUGHT: ['FOOD_SECURITY', 'WATER_SUPPLY', 'MEDICAL'],
  HEATWAVE: ['MEDICAL', 'POWER_FAILURE', 'WATER_SUPPLY'],
}
// Recommended preparedness actions per disaster (shown with every forecast).
const ACTIONS: Record<string, string[]> = {
  FLOOD: ['Pre-position boats and rescue teams', 'Check shelter readiness', 'Alert low-lying communities'],
  EARTHQUAKE: ['Verify rescue team readiness', 'Inspect critical structures', 'Stage medical supplies'],
  CYCLONE: ['Prepare shelters', 'Pre-position rescue teams', 'Review evacuation plans'],
  LANDSLIDE: ['Monitor hill roads', 'Stage rescue teams', 'Prepare alternative routes'],
  WILDFIRE: ['Stage fire teams', 'Clear fire breaks', 'Check water supply'],
  HEAVY_RAINFALL: ['Check drainage', 'Monitor flood-prone roads', 'Pre-position rescue teams'],
  EXTREME_WEATHER: ['Review response readiness', 'Check shelter capacity', 'Monitor conditions'],
  TSUNAMI: ['Review coastal evacuation zones', 'Verify warning siren readiness', 'Stage coastal rescue teams'],
  DROUGHT: ['Plan water rationing', 'Stage water tankers', 'Support vulnerable populations'],
  HEATWAVE: ['Open cooling centres', 'Stage medical teams', 'Distribute water', 'Alert elderly-care services'],
}

export interface DemandRow { resourceType: string; available: number; predicted: number; shortage: number; recommendation: string; demo?: boolean }
export interface RiskForecast {
  type: string; label: string; emoji: string
  riskLevel: RiskLevel; riskScore: number; confidence: number
  windowHours: number; region: string; potentialImpact: string
  factors: string[]; demoFactors: string[]; preparedness: string[]
  demand: DemandRow[]; cascades: string[]; dataSources: string[]
  updatedAt: string; disclaimer: string
}
const TYPE_TO_FORECAST: Record<string, string> = {
  FLOOD: 'FLOOD', EARTHQUAKE: 'EARTHQUAKE', CYCLONE: 'CYCLONE', LANDSLIDE: 'LANDSLIDE',
  FIRE: 'WILDFIRE', FOREST_FIRE: 'WILDFIRE', HEAVY_RAINFALL: 'HEAVY_RAINFALL',
}
const SEV_MULT: Record<string, number> = { LOW: 0.4, MEDIUM: 0.7, HIGH: 1, CRITICAL: 1.4 }
async function gatherInputs() {
  const since = new Date(Date.now() - 30 * 86400000)
  const [incidents, resources] = await Promise.all([
    db.incident.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 300 }),
    db.resource.findMany(),
  ])
  const lat = incidents.length ? incidents.reduce((s, i) => s + i.latitude, 0) / incidents.length : 28.61
  const lng = incidents.length ? incidents.reduce((s, i) => s + i.longitude, 0) / incidents.length : 77.21
  const weather = await getWeatherCached(lat, lng).catch(() => null)
  const region = incidents[0]?.location?.split(',')[0]?.trim() || 'Demo Region'
  return { incidents, resources, weather, region, lat, lng }
}
function scoreFor(t: DisasterTypeDef, incidents: any[], weather: any) {
  const factors: string[] = []
  const demoFactors: string[] = []
  const sources: string[] = ['Platform incident database (live)']
  let score = t.baseScore * 0.6
  const related = incidents.filter((i) => TYPE_TO_FORECAST[i.type] === t.key)
  const active = related.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status))
  if (active.length) {
    const boost = Math.min(38, active.length * 9)
    score += boost
    factors.push(active.length + ' active related incident report(s) in the last 30 days')
  }
  const people = related.reduce((s, i) => s + (i.aiPeopleAffected || 10), 0)
  const hist30 = related.length
  if (hist30 >= 3) factors.push(hist30 + ' historical reports of this hazard (30d window)')
  return { base: score, factors, demoFactors, sources, active, people }
}
function weatherBoost(t: DisasterTypeDef, w: any, f: string[]) {
  let boost = 0
  if (!w) return boost
  const p = w.precipitation || 0, wind = w.wind || w.windSpeed || 0, temp = w.temperature || 0
  const rainTypes = ['FLOOD', 'HEAVY_RAINFALL', 'LANDSLIDE']
  const windTypes = ['CYCLONE', 'EXTREME_WEATHER']
  if (rainTypes.includes(t.key)) {
    if (p > 10) { boost += 22; f.push('Heavy live rainfall (' + p + 'mm) — Open-Meteo') }
    else if (p > 2) { boost += 9; f.push('Moderate live rainfall (' + p + 'mm) — Open-Meteo') }
  }
  if (windTypes.includes(t.key)) {
    if (wind > 60) { boost += 24; f.push('High live winds (' + Math.round(wind) + ' km/h) — Open-Meteo') }
    else if (wind > 30) { boost += 10; f.push('Elevated live winds (' + Math.round(wind) + ' km/h)') }
  }
  if (t.key === 'HEATWAVE' && temp > 38) { boost += 24; f.push('Live temperature ' + temp.toFixed(1) + '°C — Open-Meteo') }
  if (t.key === 'WILDFIRE' && temp > 33 && p < 1) { boost += 14; f.push('Hot, dry live conditions — Open-Meteo') }
  return boost
}
const RESOURCE_LABELS: Record<string, string> = {
  AMBULANCE: 'Ambulances', RESCUE_TEAM: 'Rescue Teams', FIRE_TEAM: 'Fire Teams',
  MEDICAL_SUPPLY: 'Medical Supply Kits', FOOD_SUPPLY: 'Food Packets',
  WATER_SUPPLY: 'Water Supply Units', BOAT: 'Boats', SHELTER_CAP: 'Shelter Capacity',
}
function demandFor(t: DisasterTypeDef, level: RiskLevel, people: number, resources: any[]): DemandRow[] {
  const sev = SEV_MULT[level] ?? 0.7
  const per100 = Math.max(people, 50) / 100
  return (NEEDS[t.key] || []).map(([rt, per]) => {
    const predicted = Math.max(1, Math.round(per * per100 * sev))
    const inEnum = ['AMBULANCE', 'RESCUE_TEAM', 'FIRE_TEAM', 'MEDICAL_SUPPLY', 'FOOD_SUPPLY', 'WATER_SUPPLY'].includes(rt)
    const available = inEnum ? resources.filter((r) => r.type === rt && r.status === 'AVAILABLE').reduce((s, r) => s + r.capacity, 0) : 0
    const shortage = Math.max(0, predicted - available)
    return {
      resourceType: rt, available, predicted, shortage,
      recommendation: shortage > 0 ? 'Pre-position ' + shortage + ' additional ' + (RESOURCE_LABELS[rt] || rt) : 'Sufficient coverage forecast',
      demo: !inEnum,
    }
  })
}
const DISCLAIMER = 'AI-assisted decision support. Risk forecasts are NOT guaranteed predictions and do not replace official warnings or emergency services.'

export async function generateRiskForecasts() {
  const { incidents, resources, weather, region } = await gatherInputs()
  const forecasts: RiskForecast[] = DISASTER_TYPES.map((t) => {
    const s = scoreFor(t, incidents, weather)
    const wb = weatherBoost(t, weather, s.factors)
    const score = clamp(s.base + wb)
    const level = levelFor(score)
    const people = Math.max(0, s.people)
    const demoFactors: string[] = []
    if (people === 0) demoFactors.push('Population exposure estimated from default model (Simulated)')
    else demoFactors.push('Population exposure ~' + people + ' from AI-estimated report data')
    demoFactors.push('Terrain / geographic vulnerability weights (Simulated)')
    const impact = people > 0
      ? 'Potential exposure ~' + people + ' people (AI-estimated reports).'
      : 'No recent reports; impact modelled on defaults (Simulated).'
    const confidence = clamp(45 + Math.min(30, s.active.length * 6) + (weather ? 15 : 0))
    const demand = demandFor(t, level, people, resources)
    const f: RiskForecast = {
      type: t.key, label: t.label, emoji: t.emoji,
      riskLevel: level, riskScore: score, confidence,
      windowHours: t.windowHours, region,
      potentialImpact: impact,
      factors: s.factors.length ? s.factors : ['Baseline seasonal hazard profile for this region'],
      demoFactors,
      preparedness: ACTIONS[t.key] || [],
      demand,
      cascades: CASCADES[t.key] || [],
      dataSources: s.sources.concat(weather ? ['Open-Meteo live weather'] : []).concat(['Historical pattern model (Simulated)']),
      updatedAt: new Date().toISOString(),
      disclaimer: DISCLAIMER,
    }
    return f
  })
  // Persist an AiInsight snapshot (feature=RISK_FORECAST) for audit/analytics.
  try {
    const top = forecasts.filter((f) => f.riskLevel === 'CRITICAL' || f.riskLevel === 'HIGH')
    if (top.length) {
      await db.aiInsight.create({
        data: {
          feature: 'RISK_FORECAST',
          severity: top[0].riskLevel,
          confidence: top[0].confidence / 100,
          payload: { region, forecasts: top } as any,
          source: 'deterministic',
          demo: true,
        },
      })
    }
  } catch (e) { console.error('[risk-forecast] insight save failed:', e) }
  return forecasts
}
// Officer action: create an early-warning notification for officers/admins.
// Public citizen alerts are NEVER auto-sent; they require separate officer
// approval through the VerifiedAlerts workflow.
export async function issueEarlyWarning(forecast: RiskForecast, userId: string) {
  const officers = await db.user.findMany({ where: { role: { in: ['DISASTER_OFFICER', 'ADMIN'] }, active: true }, select: { id: true } })
  const msg = forecast.emoji + ' ' + forecast.riskLevel + ' ' + forecast.label.toUpperCase() + ' RISK (' + forecast.riskScore + '/100) for ' + forecast.region + ' — review preparedness actions. AI decision support; not a guaranteed prediction.'
  const notifType = forecast.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'WARNING'
  await db.notification.createMany({ data: officers.map((o) => ({ userId: o.id, message: msg, type: notifType as any, entityId: forecast.type })) })
  try {
    await db.auditLog.create({ data: { userId, action: 'EARLY_WARNING_ISSUED', entityId: forecast.type, reason: forecast.riskLevel + ' ' + forecast.label + ' risk ' + forecast.riskScore } })
  } catch { /* non-fatal */ }
  return { notified: officers.length, message: msg }
}
// What-If scenario: recompute a single forecast under modified assumptions.
// Caller labels results SIMULATION / DECISION SUPPORT.
export function applyScenario(base: RiskForecast, mods: {
  rainfallDeltaPct?: number; populationDeltaPct?: number; severityBump?: number
  resourceDeltaPct?: number; severityOverride?: RiskLevel
}) {
  const rain = 1 + (mods.rainfallDeltaPct || 0) / 100
  const pop = 1 + (mods.populationDeltaPct || 0) / 100
  const res = 1 + (mods.resourceDeltaPct || 0) / 100
  const score = clamp(base.riskScore * rain + (mods.severityBump || 0))
  const level: RiskLevel = mods.severityOverride || levelFor(score)
  const sev = SEV_MULT[level] ?? 0.7
  const people = Math.round(Math.max(50, base.riskScore >= 60 ? 300 : 100) * pop)
  const demand: DemandRow[] = base.demand.map((d) => {
    const predicted = Math.max(1, Math.round(d.predicted * sev * pop * Math.max(1, rain) * 0.9))
    const available = Math.max(0, Math.round(d.available * res))
    const shortage = Math.max(0, predicted - available)
    return { ...d, predicted, available, shortage,
      recommendation: shortage > 0 ? 'Pre-position ' + shortage + ' additional ' + (RESOURCE_LABELS[d.resourceType] || d.resourceType) : 'Sufficient coverage forecast' }
  })
  return {
    ...base, riskScore: score, riskLevel: level, demand,
    scenario: true as const,
    scenarioNote: 'SIMULATION / DECISION SUPPORT — modified assumptions: rainfall ' + Math.round((rain - 1) * 100) + '%, population ' + Math.round((pop - 1) * 100) + '%, resources ' + Math.round((res - 1) * 100) + '%. People ~' + people + '.',
  }
}
