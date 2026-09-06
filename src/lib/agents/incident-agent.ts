// Incident Agent — analyses a citizen report and returns a structured, validated JSON.
// Supports multilingual input: Telugu (te), Hindi (hi), English (en) — and any other
// language the underlying LLM can understand. The AI understands the original description
// directly; no translation step is required.
// Clearly distinguishes reported facts from AI estimates.
// Falls back to a deterministic heuristic if the AI is unavailable. Never fabricates AI output.

import { askAI, extractJson } from '@/lib/ai-client'
import type { IncidentType } from '@prisma/client'

export interface IncidentAnalysis {
  incident_type: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  situation_summary?: string
  people_affected_estimate: number
  reported_facts?: string[]
  ai_estimates?: string[]
  urgent_needs: string[]
  road_blocked: boolean
  infrastructure_damage: string[]
  risk_factors: string[]
  missing_information: string[]
  recommended_actions?: string[]
  confidence: number // 0-1
  detected_language?: string // the language the AI detected in the description
  source: 'ai' | 'fallback'
}

const SYSTEM_PROMPT = `You are an emergency-response incident analysis agent. You receive a citizen disaster report — which may be written in Telugu, Hindi, English, or any other language — and you must return STRICT JSON ONLY (no prose, no markdown fences) describing the incident. Use this exact schema:

{
  "incident_type": "FLOOD|CYCLONE|EARTHQUAKE|LANDSLIDE|ROAD_BLOCKAGE|FIRE|MEDICAL|INFRASTRUCTURE|BUILDING_COLLAPSE|FOREST_FIRE|HEAVY_RAINFALL|INDUSTRIAL_ACCIDENT|OTHER",
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "situation_summary": "<concise 1-2 sentence emergency operational brief>",
  "people_affected_estimate": <integer 0-100000>,
  "reported_facts": [<short strings of facts explicitly reported by the citizen>],
  "ai_estimates": [<short strings of AI-inferred estimates, e.g. crowd size, secondary hazard projection>],
  "urgent_needs": [<short English strings like "evacuation","medical","food","water","shelter","ambulance","rescue team","fire tender","heavy machinery">],
  "road_blocked": <true|false>,
  "infrastructure_damage": [<short English strings>],
  "risk_factors": [<short English strings>],
  "missing_information": [<short English strings>],
  "recommended_actions": [<short actionable response recommendations for incident commander>],
  "confidence": <0-1>,
  "detected_language": "<ISO 639-1 code: te, hi, en, or other>"
}

Rules:
- Understand the citizen's original description directly in its native language (Telugu, Hindi, English, etc.). Do NOT ask the citizen to translate.
- Always return the structured fields in English so the dashboard can use them, but the original citizen description is preserved separately.
- CLEARLY distinguish between reported_facts (only what the caller explicitly told you) and ai_estimates (what you deduced or estimated). Do not invent numbers or facts.
- Domain specific guidance:
  * EARTHQUAKE: Focus on structural stability, search & rescue, aftershock threats, gas line fractures.
  * LANDSLIDE: Focus on slope stabilization, route clearance, stranded vehicles, trapped dwellings.
  * ROAD_BLOCKAGE: Focus on detour viability, heavy lifting/clearing equipment, emergency vehicle routing.
  * BUILDING_COLLAPSE: Focus on trapped victims, USAR listening devices, structural shoring, triage posts.
  * FLOOD: Focus on water currents, evacuation boats, high-ground shelter, clean water supplies.
  * FOREST_FIRE: Focus on perimeter containment, smoke inhalation, downwind communities, water tankers.
  * HEAVY_RAINFALL: Focus on urban drainage surge, mud vulnerability, localized inundation.
  * INDUSTRIAL_ACCIDENT: Focus on chemical/toxic hazard perimeter, HAZMAT protocols, decontamination.
- "detected_language" should be the ISO 639-1 code of the language you detected in the description.
- Be conservative; if data is ambiguous, lower confidence and list what is missing.
- Output must be valid JSON parseable by JSON.parse.`

export async function analyzeIncident(input: {
  description: string
  incidentType: IncidentType | string
  location?: string
  language?: string | null // ISO 639-1 hint from the frontend (te/hi/en) or null
  imageMeta?: { filename?: string; size?: number; contentType?: string } | null
}): Promise<IncidentAnalysis> {
  const langHint = input.language ? `\n- Stated language: ${input.language} (use this as a hint; verify from the text itself)` : ''
  const userPrompt = `Citizen report:
- Type: ${input.incidentType}
- Location: ${input.location ?? 'not provided'}
- Description: ${input.description}
- Image attached: ${input.imageMeta ? `yes (${input.imageMeta.contentType ?? 'unknown'}, ${input.imageMeta.size ?? 0} bytes)` : 'no'}${langHint}

Analyse the description in its original language and return the JSON now.`

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
    situation_summary: typeof o.situation_summary === 'string' ? o.situation_summary.slice(0, 300) : undefined,
    people_affected_estimate: Math.max(0, Math.min(100000, Number(o.people_affected_estimate) || 0)),
    reported_facts: Array.isArray(o.reported_facts) ? o.reported_facts.slice(0, 10) : [],
    ai_estimates: Array.isArray(o.ai_estimates) ? o.ai_estimates.slice(0, 10) : [],
    urgent_needs: Array.isArray(o.urgent_needs) ? o.urgent_needs.slice(0, 12) : [],
    road_blocked: Boolean(o.road_blocked),
    infrastructure_damage: Array.isArray(o.infrastructure_damage) ? o.infrastructure_damage.slice(0, 12) : [],
    risk_factors: Array.isArray(o.risk_factors) ? o.risk_factors.slice(0, 12) : [],
    missing_information: Array.isArray(o.missing_information) ? o.missing_information.slice(0, 12) : [],
    recommended_actions: Array.isArray(o.recommended_actions) ? o.recommended_actions.slice(0, 10) : [],
    confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0.6)),
    detected_language: typeof o.detected_language === 'string' ? o.detected_language.slice(0, 5).toLowerCase() : undefined,
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

  if (/collapse|trapped|casualt|fatal|crush|toxic|hazard|blast|explos|major|severe|critical/.test(text)) {
    severity = 'CRITICAL'
    people = 300
  } else if (/cyclone|earthquake|landslide|fire|flood|burn|buried|blocked/.test(text)) {
    severity = 'HIGH'
    people = 150
  } else if (/minor|single|small|scratch|mild/.test(text)) {
    severity = 'LOW'
    people = 10
  }

  // Type specific baseline severity overrides
  if (['BUILDING_COLLAPSE', 'INDUSTRIAL_ACCIDENT'].includes(input.incidentType)) {
    severity = 'CRITICAL'
    people = Math.max(people, 200)
  }

  const roadBlocked = /road (is )?blocked|blockage|landslide|collapse|flood(ed)?|debris/.test(text) || input.incidentType === 'ROAD_BLOCKAGE'

  return {
    incident_type: input.incidentType,
    severity,
    situation_summary: `Reported ${input.incidentType.replace(/_/g, ' ').toLowerCase()} at ${input.location || 'designated coordinates'}.`,
    people_affected_estimate: people,
    reported_facts: [input.description.slice(0, 120)],
    ai_estimates: [`Estimated ~${people} individuals impacted by emergency zone`, `Baseline heuristic severity: ${severity}`],
    urgent_needs: inferNeeds(input.incidentType),
    road_blocked: roadBlocked,
    infrastructure_damage: inferDamage(input.incidentType),
    risk_factors: ['Fallback heuristic analysis — Gemini offline or rate limited. Human verification recommended.'],
    missing_information: ['Detailed on-scene casualty count', 'Structural damage assessment by civil engineers'],
    recommended_actions: inferActions(input.incidentType),
    confidence: 0.4,
    source: 'fallback',
  }
}

function inferNeeds(type: string): string[] {
  const map: Record<string, string[]> = {
    FLOOD: ['evacuation boats', 'rescue team', 'clean water', 'temporary shelter'],
    CYCLONE: ['emergency shelter', 'power restoration', 'medical team', 'debris clearing'],
    EARTHQUAKE: ['urban search & rescue', 'medical triage', 'heavy equipment', 'structural engineers'],
    LANDSLIDE: ['earth-moving equipment', 'search & rescue', 'route clearance', 'ambulance'],
    ROAD_BLOCKAGE: ['heavy towing vehicle', 'road clearing equipment', 'traffic diversion'],
    FIRE: ['fire tenders', 'burn treatment kit', 'ambulance', 'water supply'],
    BUILDING_COLLAPSE: ['search & rescue team', 'acoustic listening devices', 'triage ambulance', 'heavy cranes'],
    FOREST_FIRE: ['firefighting team', 'foam retardant', 'water tankers', 'air quality masks'],
    HEAVY_RAINFALL: ['high-capacity water pumps', 'temporary sandbags', 'rescue boats'],
    INDUSTRIAL_ACCIDENT: ['HAZMAT response team', 'decontamination unit', 'burn & respiratory ambulances'],
    MEDICAL: ['ambulance', 'paramedic crew', 'first aid kits'],
    INFRASTRUCTURE: ['utility engineering team', 'generators', 'structural inspection'],
    OTHER: ['rapid assessment team'],
  }
  return map[type] || ['rapid assessment team']
}

function inferDamage(type: string): string[] {
  const map: Record<string, string[]> = {
    FLOOD: ['submerged roadways', 'inundated basements', 'water utility disruption'],
    CYCLONE: ['damaged roofs', 'downed power lines', 'uprooted trees'],
    EARTHQUAKE: ['cracked foundations', 'masonry collapse', 'road fissures'],
    LANDSLIDE: ['roadway burial', 'slope instability', 'retaining wall failure'],
    BUILDING_COLLAPSE: ['complete structural failure', 'pancake slab collapse', 'gas line rupture risk'],
    FOREST_FIRE: ['vegetation destruction', 'nearby structural exposure', 'heavy particulate smoke'],
    HEAVY_RAINFALL: ['drainage overflow', 'localized flash flooding'],
    INDUSTRIAL_ACCIDENT: ['chemical leak', 'equipment explosion damage', 'toxic runoff'],
    ROAD_BLOCKAGE: ['debris across lanes', 'impaired emergency transit'],
    FIRE: ['structural fire damage', 'smoke impairment'],
    INFRASTRUCTURE: ['power/water grid failure', 'telecom tower down'],
    MEDICAL: [],
    OTHER: [],
  }
  return map[type] || []
}

function inferActions(type: string): string[] {
  const map: Record<string, string[]> = {
    FLOOD: ['Deploy swift-water rescue craft', 'Issue evacuation order for low-lying sectors', 'Open relief center'],
    CYCLONE: ['Activate storm shelters', 'Coordinate utility isolation', 'Stage rescue convoys'],
    EARTHQUAKE: ['Establish incident command perimeter', 'Initiate USAR grid search', 'Inspect gas and power feeds'],
    LANDSLIDE: ['Close approach roads within 2km', 'Deploy geotechnical spotters', 'Begin mechanical excavation'],
    ROAD_BLOCKAGE: ['Establish traffic diversion route', 'Dispatch heavy recovery vehicle', 'Notify emergency transit'],
    BUILDING_COLLAPSE: ['Silence area for acoustic survivor listening', 'Deploy rescue dogs and USAR team', 'Establish triage zone'],
    FOREST_FIRE: ['Establish downwind firebreak', 'Issue immediate evacuation for residential flanks', 'Stage water tenders'],
    HEAVY_RAINFALL: ['Deploy mobile sump pumps', 'Monitor catchment dam gauges', 'Place swift-water teams on standby'],
    INDUSTRIAL_ACCIDENT: ['Establish 1km upwind safety perimeter', 'Deploy HAZMAT specialized squad', 'Issue shelter-in-place alert'],
    FIRE: ['Contain fire spread to adjacent structures', 'Evacuate immediate block', 'Ventilate smoke corridors'],
    MEDICAL: ['Dispatch closest Advanced Life Support unit', 'Alert receiving trauma center'],
    INFRASTRUCTURE: ['Dispatch civil engineering repair teams', 'Deploy mobile backup generators'],
    OTHER: ['Dispatch initial reconnaissance unit'],
  }
  return map[type] || ['Dispatch initial reconnaissance unit']
}
