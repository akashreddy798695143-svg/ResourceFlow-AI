// Risk service — calculates a transparent prototype decision-support score.
// Explicitly NOT a medically/scientifically validated model.

import type { Incident, RiskLevel } from '@prisma/client'

export interface RiskResult {
  score: number // 0-100
  level: RiskLevel
  reasons: string[]
}

export function calculateRisk(input: {
  severity?: string | null
  peopleAffected?: number | null
  roadBlocked?: boolean | null
  infrastructureDamage?: string[] | null
  clusterSize: number // number of reports in the cluster (1 = standalone)
  availableResourcesNearby: number
  weather?: { precipitation?: number; wind?: number; temperature?: number } | null
  createdAt: Date
}): RiskResult {
  const reasons: string[] = []
  let score = 0

  // Severity (0-30)
  const sevMap: Record<string, number> = { LOW: 6, MEDIUM: 14, HIGH: 22, CRITICAL: 30 }
  const sev = input.severity || 'MEDIUM'
  const sevScore = sevMap[sev] ?? 14
  score += sevScore
  if (sevScore >= 22) reasons.push(`High severity (${sev})`)

  // People affected (0-20)
  const people = input.peopleAffected ?? 0
  if (people >= 500) { score += 20; reasons.push(`Very large affected population (~${people})`) }
  else if (people >= 200) { score += 15; reasons.push(`Large affected population (~${people})`) }
  else if (people >= 50) { score += 10 }
  else if (people >= 10) { score += 6 }
  else score += 2

  // Road blocked (0-10)
  if (input.roadBlocked) { score += 10; reasons.push('Road blocked — access impaired') }

  // Infrastructure damage (0-10)
  const dmgCount = input.infrastructureDamage?.length ?? 0
  if (dmgCount >= 3) { score += 10; reasons.push('Significant infrastructure damage') }
  else if (dmgCount >= 1) score += 5

  // Cluster size (0-12) — multiple corroborating reports raise risk
  if (input.clusterSize >= 5) { score += 12; reasons.push(`${input.clusterSize} corroborating reports (cluster)`) }
  else if (input.clusterSize >= 3) { score += 8; reasons.push(`${input.clusterSize} corroborating reports`) }
  else if (input.clusterSize >= 2) score += 4

  // Resource availability (0-10) — fewer nearby resources = higher risk
  if (input.availableResourcesNearby === 0) { score += 10; reasons.push('No nearby resources available') }
  else if (input.availableResourcesNearby <= 2) { score += 6; reasons.push('Limited nearby resources') }
  else if (input.availableResourcesNearby <= 5) score += 3

  // Weather (0-8) — supporting factor only
  if (input.weather) {
    const p = input.weather.precipitation ?? 0
    const w = input.weather.wind ?? 0
    if (p > 10) { score += 5; reasons.push(`Heavy precipitation (${p}mm)`) }
    else if (p > 2) score += 2
    if (w > 60) { score += 3; reasons.push(`High winds (${w}km/h)`) }
    else if (w > 30) score += 1
  }

  // Time sensitivity (0-? up to 5 bonus) — incidents older than 30 min get small urgency bump
  const ageMin = (Date.now() - input.createdAt.getTime()) / 60000
  if (ageMin > 30 && ageMin < 120) score += 3
  else if (ageMin >= 120) { score += 5; reasons.push('Long-unaddressed incident (>2h)') }

  score = Math.max(0, Math.min(100, Math.round(score)))

  const level: RiskLevel =
    score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW'

  if (reasons.length === 0) reasons.push('Standard incident profile')

  return { score, level, reasons }
}
