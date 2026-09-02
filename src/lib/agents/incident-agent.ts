// Incident Agent — analyses a citizen report and returns a structured, validated JSON.
// Falls back to a deterministic heuristic if the AI is unavailable. Never fabricates AI output.

import { askAI, extractJson } from '@/lib/ai-client'
import type { IncidentType } from '@prisma/client'

export interface IncidentAnalysis {
  incident_type: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  people_affected_estimate: number
  urgent_needs: string[]
  road_blocked: boolean
  infrastructure_damage: string[]
  risk_factors: string[]
  confidence: number // 0-1
  missing_information: string[]
  source: 'ai' | 'fallback'
}

const SYSTEM_PROMPT = `You are an emergency-response incident analysis agent. You receive a citizen disaster report and must return STRICT JSON ONLY (no prose, no markdown fences) describing the incident. Use this exact schema:

{
  "incident_type": "FLOOD|CYCLONE|EARTHQUAKE|LANDSLIDE|ROAD_BLOCKAGE|FIRE|MEDICAL|INFRASTRUCTURE|OTHER",
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "people_affected_estimate": <integer 0-100000>,
  "urgent_needs": [<short strings like "evacuation","medical","food","water","shelter">],
  "road_blocked": <true|false>,
  "infrastructure_damage": [<short strings>],
  "risk_factors": [<short strings>],
  "confidence": <0-1>,
  "missing_information": [<short strings>]
}

Rules:
- Be conservative; if data is ambiguous, lower confidence and list what is missing.
- Never invent exact measurements you cannot know (e.g. precise building counts). Prefer qualitative damage descriptions.
- Output must be valid JSON parseable by JSON.parse.`

export async function analyzeIncident(input: {
  description: string
  incidentType: IncidentType | string
  location?: string
  imageMeta?: { filename?: string; size?: number; contentType?: string } | null
}): Promise<IncidentAnalysis> {
  const userPrompt = `Citizen report:
- Type: ${input.incidentType}
- Location: ${input.location ?? 'not provided'}
- Description: ${input.description}
- Image attached: ${input.imageMeta ? `yes (${input.imageMeta.contentType ?? 'unknown'}, ${input.imageMeta.size ?? 0} bytes)` : 'no'}

Return the JSON now.`

  const res = await askAI(SYSTEM_PROMPT, userPrompt)
  if (res.ok) {
    const parsed = extractJson(res.content)
    if (parsed && validateAnalysis(parsed)) {
      return { ...normalizeAnalysis(parsed), source: 'ai' }
    }
  }
  // Fallback — deterministic heuristic, clearly flagged.
  return { ...fallbackAnalysis(input), source: 'fallback' }
}

function validateAnalysis(o: any): boolean {
  return (
    o &&
    typeof o.incident_type === 'string' &&
    typeof o.severity === 'string' &&
    typeof o.people_affected_estimate === 'number'
  )
}

function normalizeAnalysis(o: any): IncidentAnalysis {
  const allowed = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  const severity = allowed.includes(o.severity) ? o.severity : 'MEDIUM'
  return {
    incident_type: o.incident_type,
    severity,
    people_affected_estimate: Math.max(0, Math.min(100000, Number(o.people_affected_estimate) || 0)),
    urgent_needs: Array.isArray(o.urgent_needs) ? o.urgent_needs.slice(0, 12) : [],
    road_blocked: Boolean(o.road_blocked),
    infrastructure_damage: Array.isArray(o.infrastructure_damage) ? o.infrastructure_damage.slice(0, 12) : [],
    risk_factors: Array.isArray(o.risk_factors) ? o.risk_factors.slice(0, 12) : [],
    confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0.6)),
    missing_information: Array.isArray(o.missing_information) ? o.missing_information.slice(0, 12) : [],
    source: 'ai',
  }
}

function fallbackAnalysis(input: {
  description: string
  incidentType: string
  location?: string
}): IncidentAnalysis {
  const text = `${input.incidentType} ${input.description}`.toLowerCase()
  let severity: IncidentAnalysis['severity'] = 'MEDIUM'
  let people = 50
  if (/cyclone|earthquake|severe|major|collapsed|trapped|critical|casualties|fire|burning/.test(text)) {
    severity = 'CRITICAL'; people = 500
  } else if (/flood|landslide|large|widespread|building|hospital|infrastructure/.test(text)) {
    severity = 'HIGH'; people = 200
  } else if (/minor|small|single|medical|injury|injured/.test(text)) {
    severity = 'LOW'; people = 10
  }
  const roadBlocked = /road (is )?blocked|blockage|landslide|collapse|flood(ed)?/.test(text)
  return {
    incident_type: input.incidentType,
    severity,
    people_affected_estimate: people,
    urgent_needs: inferNeeds(input.incidentType),
    road_blocked: roadBlocked,
    infrastructure_damage: inferDamage(input.incidentType),
    risk_factors: ['Fallback heuristic analysis — manual review recommended'],
    confidence: 0.35,
    missing_information: ['AI unavailable — verify severity and people affected manually'],
    source: 'fallback',
  }
}

function inferNeeds(type: string): string[] {
  const map: Record<string, string[]> = {
    FLOOD: ['evacuation', 'rescue boats', 'shelter', 'clean water'],
    CYCLONE: ['evacuation', 'shelter', 'medical', 'power restoration'],
    EARTHQUAKE: ['search & rescue', 'medical', 'structural assessment'],
    LANDSLIDE: ['search & rescue', 'road clearing', 'shelter'],
    ROAD_BLOCKAGE: ['road clearing equipment'],
    FIRE: ['firefighting', 'ambulance', 'evacuation'],
    MEDICAL: ['ambulance', 'first aid', 'triage'],
    INFRASTRUCTURE: ['engineering team', 'utility inspection'],
    OTHER: ['assessment team'],
  }
  return map[type] || ['assessment team']
}

function inferDamage(type: string): string[] {
  const map: Record<string, string[]> = {
    FLOOD: ['submerged roads', 'waterlogged structures'],
    CYCLONE: ['roof damage', 'downed trees', 'power lines down'],
    EARTHQUAKE: ['possible structural collapse'],
    LANDSLIDE: ['road burial', 'slope instability'],
    FIRE: ['structural fire damage'],
    INFRASTRUCTURE: ['utility disruption'],
    ROAD_BLOCKAGE: ['debris on carriageway'],
    MEDICAL: [],
    OTHER: [],
  }
  return map[type] || []
}
