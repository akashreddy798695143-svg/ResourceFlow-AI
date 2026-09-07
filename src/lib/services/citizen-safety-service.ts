// Citizen Safety AI service layer.
// Uses the shared Gemini client (askAI/extractJson) when GEMINI_API_KEY is set,
// and falls back to deterministic rule-based DEMO logic so every feature keeps
// working when the external AI API is unavailable. Never logs or returns keys.

import { askAI, extractJson } from '@/lib/ai-client'

// ─── Shared helpers ──────────────────────────────────────────────────────────

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

function tokenize(s: string): Set<string> {
  return new Set(String(s || '').toLowerCase().split(/\W+/).filter((t) => t.length > 3))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

export type TriageSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface TriageResult {
  severity: TriageSeverity
  urgencyScore: number // 0-100
  incidentType: string
  immediateGuidance: string
  peopleAtRisk: 'unknown' | 'yes' | 'no'
  keywords: string[]
  source: 'ai' | 'demo'
}

const CRITICAL_WORDS = [
  'dying', 'trapped', 'unconscious', 'bleeding', 'breathing', 'collaps',
  'drowning', 'fire', 'burning', 'electric', 'buried', 'critical', 'emergency',
  'help me', 'not breathing', 'heart attack', 'pregnant', 'child',
]
const HIGH_WORDS = ['injured', 'water rising', 'stuck', 'stranded', 'injur', 'leaking', 'smoke', 'crack']
const MEDIUM_WORDS = ['blocked', 'flood', 'rain', 'damaged', 'damag', 'closed', 'overflow', 'unsafe']

export function ruleTriage(description: string): TriageResult {
  const d = description.toLowerCase()
  const hits = (words: string[]) => words.filter((w) => d.includes(w))
  const critical = hits(CRITICAL_WORDS)
  const high = hits(HIGH_WORDS)
  const medium = hits(MEDIUM_WORDS)

  let severity: TriageSeverity = 'MEDIUM'
  let score = 45
  if (critical.length) {
    severity = 'CRITICAL'
    score = Math.min(100, 85 + critical.length * 5)
  } else if (high.length) {
    severity = 'HIGH'
    score = Math.min(84, 65 + high.length * 5)
  } else if (medium.length) {
    severity = 'MEDIUM'
    score = Math.min(64, 40 + medium.length * 4)
  } else {
    severity = 'LOW'
    score = 30
  }

  let incidentType = 'OTHER'
  if (/drown|flood|water rising|inundat/.test(d)) incidentType = 'FLOOD'
  else if (/fire|smoke|burn/.test(d)) incidentType = 'FIRE'
  else if (/earthquake|tremor|building collapse|collaps/.test(d)) incidentType = 'BUILDING_COLLAPSE'
  else if (/landslide|mudslide/.test(d)) incidentType = 'LANDSLIDE'
  else if (/cyclone|storm|wind/.test(d)) incidentType = 'CYCLONE'
  else if (/road|blocked|traffic/.test(d)) incidentType = 'ROAD_BLOCKAGE'
  else if (/medical|injur|bleed|heart|breath|hospital|ambulance/.test(d)) incidentType = 'MEDICAL'
  else if (/power|electric|transformer|infrastruct/.test(d)) incidentType = 'INFRASTRUCTURE'

  const guidance =
    severity === 'CRITICAL'
      ? 'Call 112 immediately. Move to the safest nearby location. Do not enter flooded or structurally damaged areas. Stay on the line with responders.'
      : severity === 'HIGH'
        ? 'Move away from immediate danger. Share your live location with trusted contacts. Keep your phone charged and stay reachable.'
        : 'Avoid the affected area. Share this report and stay indoors if conditions worsen.'

  return {
    severity,
    urgencyScore: score,
    incidentType,
    immediateGuidance: guidance,
    peopleAtRisk: critical.length ? 'yes' : 'unknown',
    keywords: [...new Set([...critical, ...high, ...medium])].slice(0, 8),
    source: 'demo',
  }
}


// ─── 1. AI SOS Triage ────────────────────────────────────────────────────────

export async function triageSos(description: string, language?: string | null): Promise<TriageResult> {
  const fallback = ruleTriage(description)
  try {
    const system = [
      'You are an emergency triage engine for a disaster-response platform.',
      'Analyse the citizen emergency description and respond ONLY with JSON:',
      '{"severity":"LOW|MEDIUM|HIGH|CRITICAL","urgencyScore":0-100,"incidentType":"FLOOD|CYCLONE|EARTHQUAKE|LANDSLIDE|ROAD_BLOCKAGE|FIRE|MEDICAL|INFRASTRUCTURE|BUILDING_COLLAPSE|FOREST_FIRE|HEAVY_RAINFALL|INDUSTRIAL_ACCIDENT|OTHER","immediateGuidance":"1-2 sentences of life-safety guidance in the citizen language","peopleAtRisk":"yes|no|unknown","keywords":["..."]}',
      language ? `Write immediateGuidance in language code: ${language}.` : '',
    ].join('\n')
    const res = await askAI(system, description.slice(0, 2000))
    if (!res.ok) return fallback
    const json = extractJson(res.content)
    if (!json || !json.severity) return fallback
    const severity = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(json.severity))
      ? (json.severity as TriageSeverity)
      : fallback.severity
    return {
      severity,
      urgencyScore: Math.max(0, Math.min(100, Number(json.urgencyScore) || fallback.urgencyScore)),
      incidentType: String(json.incidentType || fallback.incidentType).toUpperCase(),
      immediateGuidance: String(json.immediateGuidance || fallback.immediateGuidance),
      peopleAtRisk: ['yes', 'no', 'unknown'].includes(json.peopleAtRisk) ? json.peopleAtRisk : 'unknown',
      keywords: Array.isArray(json.keywords) ? json.keywords.slice(0, 8).map(String) : fallback.keywords,
      source: 'ai',
    }
  } catch {
    return fallback
  }
}

// ─── 5. AI Safety Guide ──────────────────────────────────────────────────────

const SAFETY_GUIDE_DEMO: Record<string, string[]> = {
  FLOOD: [
    'Move immediately to higher ground — never walk or drive through flood water (15cm can knock you down, 60cm can float a car).',
    'Switch off electricity at the main breaker if water is entering the home.',
    'Keep a go-bag ready: water, medicines, documents in plastic, torch, power bank.',
  ],
  CYCLONE: [
    'Stay indoors, away from windows and glass doors. Take shelter in the innermost room on the ground floor.',
    'Fill buckets and containers with water in case supply is cut.',
    'Wait for the official "all clear" — the calm eye of the storm is not the end.',
  ],
  EARTHQUAKE: [
    'DROP, COVER and HOLD ON — get under a sturdy table, protect your head and neck.',
    'Stay away from windows, mirrors and heavy furniture that can topple.',
    'If outdoors, move away from buildings, trees and power lines.',
  ],
  FIRE: [
    'Get low and move out fast — smoke rises. Crawl under smoke if needed.',
    'Never use lifts. Feel doors with the back of your hand before opening.',
    'Once out, stay out. Call 112 and guide firefighters to anyone left inside.',
  ],
  LANDSLIDE: [
    'Evacuate upslope or away from the flow path immediately.',
    'Listen for cracking trees or rumbling sounds — move away from the slope.',
    'Do not return to check damage until authorities declare it safe.',
  ],
  MEDICAL: [
    'Call 108 (ambulance). Keep the patient still, warm and conscious if possible.',
    'For bleeding, apply firm direct pressure with a clean cloth.',
    'Clear the way for responders and keep your phone line open.',
  ],
  DEFAULT: [
    'Stay calm and move to a safe open area away from hazards.',
    'Keep your phone charged and follow only verified official alerts.',
    'Share your location with trusted family contacts.',
  ],
}

export async function safetyGuide(
  disasterType: string,
  context: string | null,
  language?: string | null
): Promise<{ steps: string[]; source: 'ai' | 'demo' }> {
  const key = disasterType.toUpperCase()
  const demoSteps = SAFETY_GUIDE_DEMO[key] || SAFETY_GUIDE_DEMO.DEFAULT
  try {
    const system = [
      'You are a disaster safety guide. Give 3-5 short, concrete, numbered life-safety steps.',
      'Respond ONLY with JSON: {"steps":["step 1","step 2","step 3"]}',
      language ? `Write in language code: ${language}.` : 'Write in simple English.',
      'No medical or unverified scientific claims. Prioritise immediate life safety.',
    ].join('\n')
    const user = `Disaster type: ${disasterType}. Situation: ${context || 'general preparedness'}`
    const res = await askAI(system, user)
    if (!res.ok) return { steps: demoSteps, source: 'demo' }
    const json = extractJson(res.content)
    if (json && Array.isArray(json.steps) && json.steps.length) {
      return { steps: json.steps.slice(0, 5).map(String), source: 'ai' }
    }
    return { steps: demoSteps, source: 'demo' }
  } catch {
    return { steps: demoSteps, source: 'demo' }
  }
}

// ─── 8. AI Hazard Verification (duplicate detection + confidence) ────────────

export interface HazardMatch {
  id: string
  distanceKm: number
  textSimilarity: number
  confidence: number // 0-1 combined confidence it's the same hazard
}

export function findNearbyDuplicate(
  candidate: { description: string; latitude: number; longitude: number; hazardType: string },
  existing: { id: string; description: string; latitude: number; longitude: number; hazardType: string }[],
  radiusKm = 0.8
): HazardMatch | null {
  let best: HazardMatch | null = null
  const candTokens = tokenize(candidate.description)
  for (const ex of existing) {
    const distanceKm = haversineKm(candidate.latitude, candidate.longitude, ex.latitude, ex.longitude)
    if (distanceKm > radiusKm) continue
    const textSim = jaccard(candTokens, tokenize(ex.description))
    const typeMatch = ex.hazardType === candidate.hazardType ? 0.35 : 0
    const proximity = 1 - distanceKm / radiusKm
    const confidence = Math.min(1, proximity * 0.4 + typeMatch + textSim * 0.35)
    if (!best || confidence > best.confidence) {
      best = { id: ex.id, distanceKm, textSimilarity: textSim, confidence }
    }
  }
  return best && best.confidence >= 0.5 ? best : null
}

export async function aiHazardVerify(
  description: string,
  duplicateCount: number
): Promise<{ summary: string; confidence: number; source: 'ai' | 'demo' }> {
  const demoConfidence = Math.min(0.95, 0.45 + duplicateCount * 0.18)
  try {
    const system = [
      'You verify crowdsourced hazard reports for a disaster-response platform.',
      'Respond ONLY with JSON: {"summary":"one-sentence neutral summary of the hazard","confidence":0.0-1.0}',
      'confidence should reflect how specific and plausible the description sounds.',
    ].join('\n')
    const user = `Hazard description: "${description}". Similar independent reports nearby: ${duplicateCount}`
    const res = await askAI(system, user)
    if (!res.ok) return { summary: description.slice(0, 140), confidence: demoConfidence, source: 'demo' }
    const json = extractJson(res.content)
    if (!json || !json.summary) return { summary: description.slice(0, 140), confidence: demoConfidence, source: 'demo' }
    return {
      summary: String(json.summary),
      confidence: Math.max(0, Math.min(1, Number(json.confidence) || demoConfidence)),
      source: 'ai',
    }
  } catch {
    return { summary: description.slice(0, 140), confidence: demoConfidence, source: 'demo' }
  }
}

// ─── 9. AI Report Prioritization (officer-side) ──────────────────────────────

export function scoreReportPriority(r: {
  severity: string
  confirmCount?: number
  aiConfidence?: number | null
  createdAt?: Date | string
  status?: string
}): number {
  const sev: Record<string, number> = { CRITICAL: 60, HIGH: 40, MEDIUM: 20, LOW: 5 }
  let score = sev[String(r.severity).toUpperCase()] ?? 15
  score += Math.min(15, (r.confirmCount ?? 1) - 1)
  if (r.aiConfidence != null) score += Number(r.aiConfidence) * 10
  if (r.createdAt) {
    const ageH = (Date.now() - new Date(r.createdAt).getTime()) / 3600000
    if (ageH < 2) score += 8
    else if (ageH < 12) score += 4
  }
  if (String(r.status) === 'RESOLVED' || String(r.status) === 'DISMISSED') score = Math.min(score, 10)
  return Math.round(Math.min(100, score))
}

// ─── 11. Multilingual Emergency Assistant (static UI dictionaries) ───────────

export const LANGUAGES = ['en', 'te', 'hi'] as const
export type LanguageCode = (typeof LANGUAGES)[number]

export const UI_STRINGS: Record<LanguageCode, Record<string, string>> = {
  en: {
    safetyCenter: 'Safety Center',
    sosTitle: 'Emergency SOS',
    sosDesc: 'Send your live location to responders instantly.',
    sendSos: 'SEND SOS',
    describeEmergency: 'Describe your emergency (AI will triage urgency)',
    triage: 'Analyze Urgency',
    imSafe: "I'm Safe",
    markSafe: 'Mark me safe & notify contacts',
    safetyCircle: 'Family Safety Circle',
    addContact: 'Add Trusted Contact',
    hazardMap: 'Hazard Map',
    reportHazard: 'Report Hazard',
    relief: 'Relief Request',
    requestRelief: 'Request Relief',
    shelterFeedback: 'Shelter Feedback',
    alerts: 'Verified Alerts',
    volunteer: 'Volunteer Mode',
    becomeVolunteer: 'Register as Volunteer',
    safetyGuide: 'AI Safety Guide',
    getGuide: 'Get Safety Steps',
    offlineCard: 'Offline Emergency Card',
    accessibility: 'Accessible Mode',
    language: 'Language',
  },
  te: {
    safetyCenter: 'భద్రతా కేంద్రం',
    sosTitle: 'అత్యవసర SOS',
    sosDesc: 'మీ ప్రస్తుత స్థానాన్ని వెంటనే సిబ్బందికి పంపండి.',
    sendSos: 'SOS పంపండి',
    describeEmergency: 'మీ అత్యవసర పరిస్థితిని వివరించండి',
    triage: 'తీవ్రత విశ్లేషించండి',
    imSafe: 'నేను సురక్షితంగా ఉన్నాను',
    markSafe: 'సురక్షితంగా ఉన్నట్టు గుర్తించి తెలియజేయండి',
    safetyCircle: 'కుటుంబ భద్రతా వలయం',
    addContact: 'విశ్వసనీయ సంప్రదింపు జోడించండి',
    hazardMap: 'ప్రమాద మ్యాప్',
    reportHazard: 'ప్రమాదాన్ని నివేదించండి',
    relief: 'సహాయం అభ్యర్థన',
    requestRelief: 'సహాయం కోరండి',
    shelterFeedback: 'షెల్టర్ అభిప్రాయం',
    alerts: 'ధృవీకరించిన హెచ్చరికలు',
    volunteer: 'వాలంటీర్ మోడ్',
    becomeVolunteer: 'వాలంటీర్‌గా నమోదు',
    safetyGuide: 'AI భద్రతా మార్గదర్శకి',
    getGuide: 'భద్రతా చర్యలు పొందండి',
    offlineCard: 'ఆఫ్‌లైన్ అత్యవసర కార్డ్',
    accessibility: 'సులభ మోడ్',
    language: 'భాష',
  },
  hi: {
    safetyCenter: 'सुरक्षा केंद्र',
    sosTitle: 'आपातकालीन SOS',
    sosDesc: 'अपना वर्तमान स्थान तुरंत उत्तरदाताओं को भेजें।',
    sendSos: 'SOS भेजें',
    describeEmergency: 'अपनी आपातकालीन स्थिति बताएं',
    triage: 'तीव्रता जांचें',
    imSafe: 'मैं सुरक्षित हूं',
    markSafe: 'सुरक्षित चिह्नित करें और संपर्कों को सूचित करें',
    safetyCircle: 'परिवार सुरक्षा मंडल',
    addContact: 'विश्वसनीय संपर्क जोड़ें',
    hazardMap: 'खतरा नक्शा',
    reportHazard: 'खतरा रिपोर्ट करें',
    relief: 'राहत अनुरोध',
    requestRelief: 'राहत मांगें',
    shelterFeedback: 'शेल्टर प्रतिक्रिया',
    alerts: 'सत्यापित अलर्ट',
    volunteer: 'वॉलंटियर मोड',
    becomeVolunteer: 'वॉलंटियर पंजीकृत करें',
    safetyGuide: 'AI सुरक्षा गाइड',
    getGuide: 'सुरक्षा कदम पाएं',
    offlineCard: 'ऑफ़लाइन आपातकालीन कार्ड',
    accessibility: 'सुलभ मोड',
    language: 'भाषा',
  },
}

// Voice-friendly speak() for accessible mode — no-ops on unsupported browsers.
export function speak(text: string, lang: LanguageCode = 'en') {
  try {
    const w = window as any
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    w.speechSynthesis.cancel()
    const u = new w.SpeechSynthesisUtterance(text)
    u.lang = lang === 'te' ? 'te-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN'
    u.rate = 0.95
    w.speechSynthesis.speak(u)
  } catch {
    /* ignore */
  }
}

