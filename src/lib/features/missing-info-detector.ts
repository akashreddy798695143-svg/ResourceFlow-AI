// AI Missing Information Detector — incident-type-aware follow-up questions.
// Uses deterministic heuristics over the EXISTING INCIDENT fields
// (description, originalDescription, transcription, ai* fields, imageMeta, language, etc.)
// NEVER asks duplicated questions. NEVER asks questions outside the relevant
// incident type.
import type { IncidentType } from '@prisma/client'

export interface MissingInformationQuestion {
  key: string
  question: string
  reason: string
  fieldToUpdate: string // which Incident or auxiliary field to set when answered
  applyTo?: 'incident' | 'none'
}

interface IncidentShape {
  type: IncidentType | string
  description?: string | null
  aiPeopleAffected?: number | null
  aiUrgentNeeds?: string | null
  aiRoadBlocked?: boolean | null
  aiInfrastructureDamage?: string | null
  aiMissingInfo?: string | null
  language?: string | null
  inputMethod?: string | null
  // Optional extracted facts
  peopleAffectedMentioned?: boolean
  medicalNeedsMentioned?: boolean
  accessibilityMentioned?: boolean
  waterLevelMentioned?: boolean
  trappedMentioned?: boolean
  fireSpreadMentioned?: boolean
  peopleInsideMentioned?: boolean
  buildingDamageMentioned?: boolean
  roadAccessMentioned?: boolean
  powerMentioned?: boolean
}

// Per-incident-type configuration of relevant missing-info questions
const MISSING_INFO_CONFIG: Record<string, MissingInformationQuestion[]> = {
  FLOOD: [
    {
      key: 'people_affected',
      question: 'Approximate number of people affected.',
      reason: 'Helps dispatch right-sized rescue teams and shelter capacity.',
      fieldToUpdate: 'description',
    },
    {
      key: 'water_level',
      question: 'Approximate water level (if known).',
      reason: 'Influences boat vs. high-clearance vehicle choice.',
      fieldToUpdate: 'description',
    },
    {
      key: 'accessibility',
      question: 'Is the area accessible by road right now?',
      reason: 'Determines whether rescue teams can enter by vehicle.',
      fieldToUpdate: 'description',
    },
    {
      key: 'medical_needs',
      question: 'Does anyone need medical assistance?',
      reason: 'Triggers ambulance dispatch and triage.',
      fieldToUpdate: 'description',
    },
  ],
  EARTHQUAKE: [
    {
      key: 'building_damage',
      question: 'Condition of nearby buildings (intact / cracked / collapsed).',
      reason: 'Drives urban-search-and-rescue priority and aftershock risk.',
      fieldToUpdate: 'description',
    },
    {
      key: 'trapped',
      question: 'Are there trapped or injured people?',
      reason: 'Required for USAR team activation and triage setup.',
      fieldToUpdate: 'description',
    },
    {
      key: 'road_access',
      question: 'Road accessibility to the location.',
      reason: 'Affects routing and staging of equipment.',
      fieldToUpdate: 'description',
    },
    {
      key: 'medical_needs',
      question: 'Does anyone need medical assistance?',
      reason: 'Coordinates ambulance + paramedic team.',
      fieldToUpdate: 'description',
    },
  ],
  FIRE: [
    {
      key: 'people_inside',
      question: 'Are there people inside the affected structure?',
      reason: 'Critical for firefighter entry tactics and rescue priority.',
      fieldToUpdate: 'description',
    },
    {
      key: 'fire_spread',
      question: 'Is the fire spreading and in which direction?',
      reason: 'Defines containment perimeter and downwind risk.',
      fieldToUpdate: 'description',
    },
    {
      key: 'building_access',
      question: 'How difficult is it to access the building?',
      reason: 'Affects ladder / entry equipment selection.',
      fieldToUpdate: 'description',
    },
    {
      key: 'medical_needs',
      question: 'Does anyone need medical assistance?',
      reason: 'Coordinates burn-care ambulances.',
      fieldToUpdate: 'description',
    },
  ],
  FOREST_FIRE: [
    {
      key: 'fire_spread',
      question: 'Direction and rate of fire spread.',
      reason: 'Sets downwind risk for nearby communities.',
      fieldToUpdate: 'description',
    },
    {
      key: 'people_inside',
      question: 'Are there people, livestock, or structures in the path?',
      reason: 'Drives evacuation and structure-protection priority.',
      fieldToUpdate: 'description',
    },
    {
      key: 'accessibility',
      question: 'How accessible is the area to fire crews?',
      reason: 'Affects staging of tankers / aerial support.',
      fieldToUpdate: 'description',
    },
  ],
  BUILDING_COLLAPSE: [
    {
      key: 'trapped',
      question: 'Number and last known location of trapped people.',
      reason: 'Required for USAR team allocation and listening-device deployment.',
      fieldToUpdate: 'description',
    },
    {
      key: 'building_damage',
      question: 'Type of collapse (pancake / lean-to / V-shape).',
      reason: 'Determines shoring strategy and void search.',
      fieldToUpdate: 'description',
    },
    {
      key: 'utility_risk',
      question: 'Any gas line fracture or electrical hazard?',
      reason: 'Triggers utility shut-off coordination.',
      fieldToUpdate: 'description',
    },
    {
      key: 'medical_needs',
      question: 'Does anyone need medical assistance?',
      reason: 'Coordinates triage ambulance on scene.',
      fieldToUpdate: 'description',
    },
  ],
  MEDICAL: [
    {
      key: 'people_affected',
      question: 'How many patients and what symptoms?',
      reason: 'Drives ambulance count and paramedic skill mix.',
      fieldToUpdate: 'description',
    },
    {
      key: 'medical_needs',
      question: 'Does anyone need medical assistance?',
      reason: 'Activates closest ambulance dispatch.',
      fieldToUpdate: 'description',
    },
    {
      key: 'accessibility',
      question: 'Is the location accessible by road?',
      reason: 'Affects vehicle approach and staging.',
      fieldToUpdate: 'description',
    },
  ],
  LANDSLIDE: [
    {
      key: 'trapped',
      question: 'Are there trapped vehicles or people?',
      reason: 'Required for earth-moving equipment and rescue teams.',
      fieldToUpdate: 'description',
    },
    {
      key: 'road_access',
      question: 'Which road(s) are blocked?',
      reason: 'Determines detour routes and emergency-vehicle routing.',
      fieldToUpdate: 'description',
    },
    {
      key: 'people_affected',
      question: 'Approximate number of people affected.',
      reason: 'Influences shelter and relief staging.',
      fieldToUpdate: 'description',
    },
  ],
  ROAD_BLOCKAGE: [
    {
      key: 'road_access',
      question: 'Which road is blocked and how severely?',
      reason: 'Determines route-closure notification and detour.',
      fieldToUpdate: 'description',
    },
    {
      key: 'people_affected',
      question: 'Any vehicles or people stranded?',
      reason: 'Triggers rescue / relief coordination.',
      fieldToUpdate: 'description',
    },
  ],
  CYCLONE: [
    {
      key: 'people_affected',
      question: 'Approximate number of people affected.',
      reason: 'Drives evacuation / shelter sizing.',
      fieldToUpdate: 'description',
    },
    {
      key: 'shelter_need',
      question: 'Do people need emergency shelter?',
      reason: 'Mobilises emergency shelters and supplies.',
      fieldToUpdate: 'description',
    },
    {
      key: 'medical_needs',
      question: 'Does anyone need medical assistance?',
      reason: 'Coordinates medical team dispatch.',
      fieldToUpdate: 'description',
    },
  ],
  HEAVY_RAINFALL: [
    {
      key: 'people_affected',
      question: 'Approximate number of people affected.',
      reason: 'Influences relief effort scaling.',
      fieldToUpdate: 'description',
    },
    {
      key: 'flooding_risk',
      question: 'Any flooding or drainage overflow?',
      reason: 'Activates pumping equipment and rescue boats.',
      fieldToUpdate: 'description',
    },
    {
      key: 'medical_needs',
      question: 'Does anyone need medical assistance?',
      reason: 'Coordinates ambulance dispatch.',
      fieldToUpdate: 'description',
    },
  ],
  INDUSTRIAL_ACCIDENT: [
    {
      key: 'chemical_hazard',
      question: 'Any chemical / toxic / HAZMAT release?',
      reason: 'Triggers HAZMAT perimeter and decontamination.',
      fieldToUpdate: 'description',
    },
    {
      key: 'trapped',
      question: 'Are there trapped or injured workers?',
      reason: 'Required for industrial rescue team.',
      fieldToUpdate: 'description',
    },
    {
      key: 'people_affected',
      question: 'Approximate number of people affected.',
      reason: 'Drives response scaling.',
      fieldToUpdate: 'description',
    },
  ],
  INFRASTRUCTURE: [
    {
      key: 'power',
      question: 'Are power / water / telecom utilities affected?',
      reason: 'Coordinates utilities restoration teams.',
      fieldToUpdate: 'description',
    },
    {
      key: 'people_affected',
      question: 'Approximate number of people affected.',
      reason: 'Influences relief effort scaling.',
      fieldToUpdate: 'description',
    },
    {
      key: 'accessibility',
      question: 'Is the area accessible safely?',
      reason: 'Determines whether crews can start work.',
      fieldToUpdate: 'description',
    },
  ],
  OTHER: [
    {
      key: 'people_affected',
      question: 'Approximate number of people affected.',
      reason: 'Influences response scaling.',
      fieldToUpdate: 'description',
    },
    {
      key: 'medical_needs',
      question: 'Does anyone need medical assistance?',
      reason: 'Coordinates medical team dispatch.',
      fieldToUpdate: 'description',
    },
    {
      key: 'accessibility',
      question: 'Is the area accessible by road?',
      reason: 'Determines resource approach.',
      fieldToUpdate: 'description',
    },
  ],
}

const KEYWORD_HINTS: Record<string, RegExp[]> = {
  people_affected: [/people|persons?|individuals?|family|families|villagers|residents|population|patients?|people trapped|stranded/i],
  medical_needs: [/medical|injur|bleeding|burnt|casualt|hospital|ambulance|wound|unconscious/i],
  accessibility: [/accessible|access by|approach|reach|road open|reachable/i],
  water_level: [/water level|depth|ankle|knee|waist|submerged|flood level/i],
  trapped: [/trapped|stuck|buried|cannot move|no escape|missing/i],
  fire_spread: [/spreading|spread|direction|wind|smoke|approaching/i],
  people_inside: [/people inside|residents inside|family inside|still inside|someone inside/i],
  building_damage: [/collapsed?|crack|sagging|tilting|structure|destroyed|partial collapse/i],
  road_access: [/road (is |now )?(blocked|closed)|impassable|detour|alternate route|route/i],
  power: [/power outage|no electricity|blackout|electricity|dark/i],
  shelter_need: [/shelter|temporary home|nowhere to stay|stranded|displaced/i],
  flooding_risk: [/drainage|overflow|storm drain|flooded|inundat/i],
  chemical_hazard: [/chemical|hazard|toxic|gas leak|fume|hazmat/i],
  utility_risk: [/gas (line )?(leak|rupture)|electric (shock|hazard)/i],
}

function detectKeywords(text: string): Record<string, boolean> {
  const t = (text || '').toLowerCase()
  const out: Record<string, boolean> = {}
  for (const [k, regs] of Object.entries(KEYWORD_HINTS)) {
    out[k] = regs.some((re) => re.test(t))
  }
  return out
}

export function detectMissingInformation(incident: IncidentShape): MissingInformationQuestion[] {
  const config = MISSING_INFO_CONFIG[incident.type as string] || MISSING_INFO_CONFIG.OTHER
  const hints = detectKeywords(`${incident.description || ''}`)

  // Also respect what's already extracted by the AI JSON pipeline
  const alreadyKnown = new Set<string>()
  if (incident.aiPeopleAffected && incident.aiPeopleAffected > 0) alreadyKnown.add('people_affected')
  if (incident.aiRoadBlocked === true) alreadyKnown.add('road_access')
  if (typeof incident.aiUrgentNeeds === 'string' && /medical|ambulance|injury/i.test(incident.aiUrgentNeeds)) alreadyKnown.add('medical_needs')
  for (const [k, v] of Object.entries(hints)) {
    if (v) alreadyKnown.add(k)
  }

  // Filter to questions not already answered
  const remaining = config.filter((q) => !alreadyKnown.has(q.key))
  return remaining
}

// Used by the API: GET /api/features/missing-info?incidentId=...
// Identifies missing information for an incident owned by the citizen.
export async function detectMissingInformationForIncidentId(incidentId: string) {
  const { db } = await import('@/lib/db')
  const incident = await db.incident.findUnique({ where: { id: incidentId } })
  if (!incident) return { available: false, dataUnavailableReason: 'incident_not_found', questions: [], alreadyKnown: [] as string[] }
  const text = `${incident.description || ''} ${incident.originalDescription || ''} ${incident.transcription || ''} ${incident.aiUrgentNeeds || ''}`
  const hints = detectKeywords(text)

  const alreadyKnown: string[] = []
  if (incident.aiPeopleAffected != null && incident.aiPeopleAffected > 0) alreadyKnown.push('people_affected')
  // description keyword matches
  for (const [k, v] of Object.entries(hints)) {
    if (v) alreadyKnown.push(k)
  }

  const all = detectMissingInformation({
    type: incident.type,
    description: incident.description,
    aiPeopleAffected: incident.aiPeopleAffected,
    aiRoadBlocked: incident.aiRoadBlocked,
    aiUrgentNeeds: incident.aiUrgentNeeds,
  })

  return {
    available: true,
    incidentId: incident.id,
    incidentCode: incident.incidentCode,
    type: incident.type,
    alreadyKnown: Array.from(new Set(alreadyKnown)),
    questions: all,
    generatedAt: new Date().toISOString(),
  }
}

// Build a natural-language summary of missing information for a citizen.
export function summarizeForCitizen(result: {
  type?: string
  alreadyKnown: string[]
  questions: MissingInformationQuestion[]
}): string {
  if (result.alreadyKnown.length === 0 && result.questions.length === 0) {
    return 'No additional information is required right now.'
  }
  const lines: string[] = []
  if (result.type) {
    lines.push(`Incident type: ${result.type}`)
  }
  if (result.alreadyKnown.length > 0) {
    lines.push('Information already captured:')
    for (const k of result.alreadyKnown) lines.push(`• ${k.replace(/_/g, ' ')}`)
  }
  if (result.questions.length > 0) {
    lines.push('')
    lines.push('To help responders, please add:')
    for (const q of result.questions) lines.push(`• ${q.question}`)
  }
  return lines.join('\n')
}
