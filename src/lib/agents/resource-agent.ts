// Resource Agent — optimises resource assignment for an incident.
// Considers distance, ETA, type match, capacity, severity, road blockage, and availability.
// Falls back to a deterministic optimizer if the AI is unavailable.

import { askAI, extractJson } from '@/lib/ai-client'
import type { Incident, Resource, ResourceType } from '@prisma/client'

export interface ResourceRecommendation {
  recommended_resource: {
    id: string
    code: string
    name: string
    type: string
    eta_minutes: number
    distance_km: number
    capacity: number
    reason: string
  } | null
  alternative_resources: Array<{
    id: string
    code: string
    name: string
    type: string
    eta_minutes: number
    distance_km: number
    reason: string
  }>
  reason: string
  source: 'ai' | 'fallback'
}

// Map incident type → eligible resource types
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

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// ETA estimate: assume 40 km/h average response speed → minutes = dist/speed*60
export function estimateEtaMinutes(distanceKm: number, roadBlocked: boolean = false): number {
  const baseMinutes = (distanceKm / 40) * 60
  const factor = roadBlocked ? 1.4 : 1.0 // 40% detour penalty when access road is impaired
  return Math.max(2, Math.round(baseMinutes * factor))
}

export async function recommendResource(
  incident: Pick<Incident, 'id' | 'type' | 'latitude' | 'longitude' | 'aiSeverity' | 'aiPeopleAffected' | 'aiRoadBlocked'>,
  resources: Resource[]
): Promise<ResourceRecommendation> {
  const eligible = ELIGIBLE[incident.type] || ELIGIBLE.OTHER
  // Only AVAILABLE resources of eligible type
  const candidates = resources.filter((r) => r.status === 'AVAILABLE' && eligible.includes(r.type))
  if (candidates.length === 0) {
    return {
      recommended_resource: null,
      alternative_resources: [],
      reason: 'No eligible resources currently available — manual dispatch or mutual aid escalation required.',
      source: 'fallback',
    }
  }

  const roadBlocked = Boolean(incident.aiRoadBlocked) || incident.type === 'ROAD_BLOCKAGE' || incident.type === 'LANDSLIDE'

  // Score each candidate deterministically
  const scored = candidates.map((r) => {
    const distance = haversineKm(incident.latitude, incident.longitude, r.latitude, r.longitude)
    const eta = r.eta ?? estimateEtaMinutes(distance, roadBlocked)
    const severityBoost = (incident.aiSeverity || 'MEDIUM') === 'CRITICAL' ? 1.3 : 1.0
    const capacityFactor = Math.max(0.6, Math.min(1.6, r.capacity / 40))
    // Lower score is better. Smaller distance & ETA are rewarded; capacity helps mitigate overload.
    const score = (eta / capacityFactor) * severityBoost
    return { resource: r, distance, eta, score }
  }).sort((a, b) => a.score - b.score)

  const recommended = scored[0]
  const alternatives = scored.slice(1, 4)

  // Try to enrich the reason with the AI for explainability — fallback to heuristic reason.
  const systemPrompt = `You are a disaster resource-optimisation agent. Given an incident and a recommended resource, return STRICT JSON ONLY with a clear, professional reason field explaining why this resource was chosen (considering distance, ETA, capacity, and incident urgency). Schema: {"reason": "<string>", "alt_reasons": ["<string>"]}`
  const userPrompt = `Incident: type=${incident.type}, severity=${incident.aiSeverity}, people~${incident.aiPeopleAffected}, roadBlocked=${roadBlocked}
Recommended: ${recommended.resource.resourceCode} (${recommended.resource.name}, type=${recommended.resource.type}, ETA=${recommended.eta}min, distance=${recommended.distance.toFixed(1)}km, capacity=${recommended.resource.capacity})
Alternatives: ${alternatives.map((a) => a.resource.resourceCode).join(', ')}`

  const res = await askAI(systemPrompt, userPrompt)
  if (res.ok) {
    const parsed = extractJson(res.content)
    if (parsed && typeof parsed.reason === 'string') {
      return {
        recommended_resource: {
          id: recommended.resource.id,
          code: recommended.resource.resourceCode,
          name: recommended.resource.name,
          type: recommended.resource.type,
          eta_minutes: recommended.eta,
          distance_km: Number(recommended.distance.toFixed(1)),
          capacity: recommended.resource.capacity,
          reason: parsed.reason,
        },
        alternative_resources: alternatives.map((a) => ({
          id: a.resource.id,
          code: a.resource.resourceCode,
          name: a.resource.name,
          type: a.resource.type,
          eta_minutes: a.eta,
          distance_km: Number(a.distance.toFixed(1)),
          reason: (parsed.alt_reasons && parsed.alt_reasons[alternatives.indexOf(a)]) || `Backup option — ETA ${a.eta}min, ${a.distance.toFixed(1)}km`,
        })),
        reason: parsed.reason,
        source: 'ai',
      }
    }
  }

  // Fallback reason — deterministic
  const detourNote = roadBlocked ? ' (includes road detour estimate)' : ''
  const reason = `Assigned ${recommended.resource.resourceCode}: Closest eligible ${recommended.resource.type.replace(/_/g, ' ').toLowerCase()} unit (${recommended.distance.toFixed(1)}km, ETA ~${recommended.eta} min${detourNote}) with matching capacity of ${recommended.resource.capacity} personnel.`
  return {
    recommended_resource: {
      id: recommended.resource.id,
      code: recommended.resource.resourceCode,
      name: recommended.resource.name,
      type: recommended.resource.type,
      eta_minutes: recommended.eta,
      distance_km: Number(recommended.distance.toFixed(1)),
      capacity: recommended.resource.capacity,
      reason,
    },
    alternative_resources: alternatives.map((a) => ({
      id: a.resource.id,
      code: a.resource.resourceCode,
      name: a.resource.name,
      type: a.resource.type,
      eta_minutes: a.eta,
      distance_km: Number(a.distance.toFixed(1)),
      reason: `Backup option — ETA ${a.eta}min, ${a.distance.toFixed(1)}km (capacity ${a.resource.capacity})`,
    })),
    reason,
    source: 'fallback',
  }
}
