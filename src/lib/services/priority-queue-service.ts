// GAME-CHANGER #3 — EMERGENCY MESSAGE PRIORITY QUEUE
// + GAME-CHANGER #1 — ONE-TAP EMERGENCY COMMUNICATION (quick structured updates)
// ------------------------------------------------------------------
// Citizens send terse, high-signal messages ("Need water", "People trapped").
// This service normalises every quick action into a STRUCTURED incident update,
// classifies its priority with AI, and exposes an officer-facing queue that
// always surfaces CRITICAL traffic first.
//
// DESIGN RULES:
//  * AI classifies; it never deletes or rewrites a citizen's words. The original
//    text is preserved on the incident update.
//  * When AI is unavailable we fall back to a deterministic keyword classifier
//    and label the result `source: 'heuristic'` — the officer can see which was
//    used. We never present a heuristic as an AI verdict.
//  * Priority is recomputed as new information arrives (never frozen at creation).

import { db } from '@/lib/db'
import { askAI, extractJson } from '@/lib/ai-client'
import { recordIncidentEvent, recordAudit } from '@/lib/events'
import { pushNotification } from '@/lib/notifications'

export type MessagePriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface QuickActionDef {
  key: string
  label: string
  // The structured need this action maps to.
  needType: string
  incidentTypeHint?: string
  severityHint: MessagePriority
  emoji?: string
}

/**
 * The one-tap quick actions a citizen can send.
 * Kept intentionally short — a stressed user should never type a paragraph.
 */
export const QUICK_ACTIONS: QuickActionDef[] = [
  { key: 'SOS', label: 'SOS', needType: 'rescue', severityHint: 'CRITICAL', emoji: '🆘' },
  { key: 'NEED_RESCUE', label: 'Need rescue', needType: 'rescue', severityHint: 'CRITICAL' },
  { key: 'PERSON_INJURED', label: 'Person injured', needType: 'medical', incidentTypeHint: 'MEDICAL', severityHint: 'CRITICAL' },
  { key: 'NEED_AMBULANCE', label: 'Need ambulance', needType: 'ambulance', incidentTypeHint: 'MEDICAL', severityHint: 'HIGH' },
  { key: 'ROAD_BLOCKED', label: 'Road blocked', needType: 'route clearance', incidentTypeHint: 'ROAD_BLOCKAGE', severityHint: 'MEDIUM' },
  { key: 'SHELTER_REQUIRED', label: 'Shelter required', needType: 'shelter', severityHint: 'HIGH' },
  { key: 'NEED_WATER', label: 'Need water', needType: 'water', severityHint: 'HIGH' },
  { key: 'NEED_FOOD', label: 'Need food', needType: 'food', severityHint: 'MEDIUM' },
]

export function findQuickAction(key: string): QuickActionDef | undefined {
  return QUICK_ACTIONS.find((a) => a.key === key)
}

// ─── Deterministic classifier (fallback + AI sanity check) ────────────────
// Ordered by urgency: the first matching rule wins so "trapped and need water"
// resolves to CRITICAL rather than HIGH.
const PRIORITY_RULES: { level: MessagePriority; re: RegExp; reason: string }[] = [
  {
    level: 'CRITICAL',
    re: /trapped|bury|buried|drown|drowning|not breathing|unconscious|bleeding heavily|critical|life.?threat|children trapped|elderly trapped|collapse|fire spreading|sos|sinking/i,
    reason: 'Immediate danger to life indicated',
  },
  {
    level: 'HIGH',
    re: /injur|wound|ambulance|hospital|medical|pregnan|diabet|heart|insulin|medicine|no water|drinking water|thirst|shelter required|homeless|evacuat|stranded|no food|starving|hours without|baby|infant/i,
    reason: 'Urgent humanitarian or medical need',
  },
  {
    level: 'MEDIUM',
    re: /road.?block|blocked|blockage|debris|power|electric|fallen tree|partial|slow|delay|waterlogg|water logging|minor flood/i,
    reason: 'Operational obstruction, not immediately life-threatening',
  },
  {
    level: 'LOW',
    re: /information|update|when will|status|general|inquiry|question|query|weather|rumou?r|confirm/i,
    reason: 'Informational request',
  },
]

export function classifyPriorityHeuristic(text: string): { level: MessagePriority; reason: string; matched: boolean } {
  const t = String(text || '')
  for (const rule of PRIORITY_RULES) {
    if (rule.re.test(t)) return { level: rule.level, reason: rule.reason, matched: true }
  }
  return { level: 'MEDIUM', reason: 'No severity signal detected — default queued for officer review', matched: false }
}

const PRIORITY_ORDER: Record<MessagePriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export interface ClassifiedMessage {
  priority: MessagePriority
  reason: string
  requiredAction: string
  peopleAffected: number | null
  needs: string[]
  source: 'ai' | 'heuristic'
}

const CLASSIFY_SYSTEM = `You are an emergency-message triage classifier for a disaster coordination platform.
You receive a short citizen message (English, Telugu, Hindi or mixed) plus optional structured context.

Return STRICT JSON ONLY:
{
  "priority": "CRITICAL|HIGH|MEDIUM|LOW",
  "reason": "<one short sentence explaining the classification>",
  "required_action": "<the single most useful immediate action for the command center>",
  "people_affected": <integer or null if not stated>,
  "needs": [<short English need labels: "rescue","medical","water","food","shelter","route clearance","ambulance">]
}

Priority guidance:
- CRITICAL: trapped people, drowning, life-threatening injury, active fire spreading, building collapse.
- HIGH: injury, medical need, no drinking water, no food for many hours, shelter required, evacuation needed.
- MEDIUM: road partially blocked, power outage, drainage/waterlogging, non-urgent obstruction.
- LOW: general information, status enquiries, questions.

Rules:
- Base the priority ONLY on what the message actually says. Never invent victims or numbers.
- If the message is ambiguous, choose the LOWER priority and say what is missing in "reason".
- Never refuse. Output valid JSON parseable by JSON.parse.`

/**
 * Classify a citizen message. Uses AI with a deterministic fallback.
 * Never throws.
 */
export async function classifyMessage(params: {
  text: string
  incidentType?: string | null
  location?: string | null
  peopleAffected?: number | null
}): Promise<ClassifiedMessage> {
  const heuristic = classifyPriorityHeuristic(params.text)

  const contextLines = [
    `Message: ${params.text}`,
    params.incidentType ? `Incident type: ${params.incidentType}` : null,
    params.location ? `Location: ${params.location}` : null,
    params.peopleAffected != null ? `Citizen-declared people affected: ${params.peopleAffected}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const res = await askAI(CLASSIFY_SYSTEM, contextLines)

  if (res.ok) {
    const parsed = extractJson<{
      priority?: string
      reason?: string
      required_action?: string
      people_affected?: number | null
      needs?: string[]
    }>(res.content)

    const allowed: MessagePriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
    const aiPriority = typeof parsed?.priority === 'string' ? parsed.priority.toUpperCase() : ''
    if (allowed.includes(aiPriority as MessagePriority)) {
      return {
        priority: aiPriority as MessagePriority,
        reason: (parsed?.reason || heuristic.reason).toString().slice(0, 300),
        requiredAction: (parsed?.required_action || 'Officer review required').toString().slice(0, 300),
        peopleAffected:
          typeof parsed?.people_affected === 'number' && Number.isFinite(parsed.people_affected)
            ? Math.max(0, Math.round(parsed.people_affected))
            : null,
        needs: Array.isArray(parsed?.needs) ? parsed!.needs!.slice(0, 8).map((n) => String(n)) : [],
        source: 'ai',
      }
    }
  }

  // Honest fallback — labelled as heuristic, never as AI.
  return {
    priority: heuristic.level,
    reason: heuristic.reason,
    requiredAction:
      heuristic.level === 'CRITICAL'
        ? 'Immediate dispatch — confirm location and dispatch nearest rescue capability.'
        : heuristic.level === 'HIGH'
        ? 'Assign the matching resource and confirm the citizen has been contacted.'
        : heuristic.level === 'MEDIUM'
        ? 'Queue for officer review; monitor for escalation.'
        : 'Acknowledge and respond with information.',
    peopleAffected: params.peopleAffected ?? null,
    needs: [],
    source: 'heuristic',
  }
}

// ─── Quick action → structured incident update ────────────────────────────

/**
 * Convert a one-tap quick action into a structured incident update.
 * Appends to the incident timeline, reclassifies priority and notifies officers.
 */
export async function sendQuickActionUpdate(params: {
  incidentId: string
  actionKey: string
  userId: string
  userRole: string
  latitude?: number | null
  longitude?: number | null
  accuracy?: number | null
  note?: string | null
  language?: string | null
}) {
  const action = findQuickAction(params.actionKey)
  if (!action) throw new Error('Unknown quick action')

  const incident = await db.incident.findUnique({ where: { id: params.incidentId } })
  if (!incident) throw new Error('Incident not found')

  // Structured message text — the citizen's chosen action plus any optional note.
  const note = params.note ? String(params.note).slice(0, 500).trim() : ''
  const structuredText = note
    ? `${action.label} — ${note}`
    : `${action.label}`

  const classified = await classifyMessage({
    text: structuredText,
    incidentType: incident.type,
    location: incident.location,
    peopleAffected: incident.aiPeopleAffected ?? null,
  })

  // Priority floor: a quick action carries an intrinsic severity hint. We never
  // let classification DOWNGRADE "Person injured" below CRITICAL.
  const priority = PRIORITY_ORDER[classified.priority] < PRIORITY_ORDER[action.severityHint]
    ? classified.priority
    : action.severityHint

  const isCritical = priority === 'CRITICAL'

  await recordIncidentEvent(params.incidentId, 'CITIZEN_QUICK_UPDATE', {
    label: `${action.label}${note ? ` — ${note}` : ''} (priority ${priority})`,
    actionKey: action.key,
    needType: action.needType,
    priority,
    priorityReason: classified.reason,
    requiredAction: classified.requiredAction,
    classificationSource: classified.source,
    originalText: structuredText,
    note,
    language: params.language ?? incident.language ?? null,
    latitude: params.latitude ?? null,
    longitude: params.longitude ?? null,
    accuracy: params.accuracy ?? null,
  })

  await recordAudit({
    userId: params.userId,
    role: params.userRole,
    action: 'CITIZEN_QUICK_UPDATE',
    entityId: params.incidentId,
    newState: priority,
    reason: `${action.label} (${classified.source} classification)`,
  })

  // Critical traffic escalates immediately and alerts the command center.
  if (isCritical) {
    await db.incident.update({
      where: { id: params.incidentId },
      data: {
        riskLevel: incident.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'CRITICAL',
        escalationLevel: Math.max(incident.escalationLevel, 1),
      },
    }).catch(() => {})

    await pushNotification({
      type: 'CRITICAL',
      message: `CRITICAL update on ${incident.incidentCode}: ${action.label}${note ? ` — ${note}` : ''}`,
      entityId: params.incidentId,
    })
  } else {
    await pushNotification({
      type: priority === 'HIGH' ? 'WARNING' : 'INFO',
      message: `${priority} update on ${incident.incidentCode}: ${action.label}${note ? ` — ${note}` : ''}`,
      entityId: params.incidentId,
    })
  }

  return {
    incidentId: params.incidentId,
    incidentCode: incident.incidentCode,
    action: { key: action.key, label: action.label },
    needType: action.needType,
    priority,
    priorityReason: classified.reason,
    requiredAction: classified.requiredAction,
    classificationSource: classified.source,
    structuredText,
    createdAt: new Date().toISOString(),
  }
}

// ─── Priority queue (officer command center) ──────────────────────────────

export interface PriorityQueueItem {
  incidentId: string
  incidentCode: string
  priority: MessagePriority
  priorityReason: string
  timeReceived: string
  incident: {
    type: string
    location: string
    latitude: number
    longitude: number
    status: string
  }
  message: string
  originalMessage: string
  translation: { text: string; sourceLang: string; targetLang: string; source: string } | null
  peopleAffected: number | null
  requiredAction: string
  needs: string[]
  classificationSource: string
  source: 'QUICK_ACTION' | 'SOS' | 'REPORT' | 'CHAT'
}

/**
 * Build the emergency communication priority queue.
 * CRITICAL first, then by recency. Driven by real incident events only.
 */
export async function getPriorityQueue(opts: {
  limit?: number
  minPriority?: MessagePriority
  incidentId?: string
} = {}): Promise<{ items: PriorityQueueItem[]; counts: Record<MessagePriority, number>; generatedAt: string }> {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 200)
  const minLevel = opts.minPriority ? PRIORITY_ORDER[opts.minPriority] : 3

  // Pull recent citizen-originated events that carry communication signal.
  const events = await db.incidentEvent.findMany({
    where: {
      eventType: { in: ['CITIZEN_QUICK_UPDATE', 'SOS_ONE_TAP', 'INCIDENT_CREATED'] },
      ...(opts.incidentId ? { incidentId: opts.incidentId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 400,
    include: {
      Incident: {
        select: {
          id: true, incidentCode: true, type: true, location: true,
          latitude: true, longitude: true, status: true,
          aiPeopleAffected: true, aiUrgentNeeds: true, language: true,
        },
      },
    },
  })

  const items: PriorityQueueItem[] = []
  const counts: Record<MessagePriority, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }

  for (const ev of events) {
    const inc = ev.Incident
    if (!inc) continue

    let data: any = {}
    try { data = JSON.parse(ev.data || '{}') } catch { /* keep {} */ }

    // Determine the priority for this entry.
    let priority: MessagePriority
    let source: PriorityQueueItem['source']

    if (ev.eventType === 'CITIZEN_QUICK_UPDATE') {
      priority = (data.priority as MessagePriority) || classifyPriorityHeuristic(String(data.originalText || '')).level
      source = 'QUICK_ACTION'
    } else if (ev.eventType === 'SOS_ONE_TAP') {
      priority = 'CRITICAL'
      source = 'SOS'
    } else {
      // INCIDENT_CREATED — a fresh citizen report is queued HIGH until the
      // officer (or the risk engine) reclassifies it.
      priority = 'HIGH'
      source = 'REPORT'
    }

    counts[priority] = (counts[priority] ?? 0) + 1

    if (PRIORITY_ORDER[priority] > minLevel) continue

    const originalMessage =
      data.originalText ||
      (ev.eventType === 'SOS_ONE_TAP' ? 'One-tap SOS — immediate assistance requested at current location.' : '') ||
      ''

    items.push({
      incidentId: inc.id,
      incidentCode: inc.incidentCode,
      priority,
      priorityReason: data.priorityReason || 'Awaiting officer review',
      timeReceived: ev.createdAt.toISOString(),
      incident: {
        type: inc.type,
        location: inc.location,
        latitude: inc.latitude,
        longitude: inc.longitude,
        status: inc.status,
      },
      message: originalMessage || `${inc.type.replace(/_/g, ' ')} reported`,
      originalMessage: originalMessage || `${inc.type.replace(/_/g, ' ')} reported`,
      translation: null,
      peopleAffected: data.peopleAffected ?? inc.aiPeopleAffected ?? null,
      requiredAction: data.requiredAction || 'Officer review required',
      needs: Array.isArray(data.needs) && data.needs.length
        ? data.needs
        : (() => {
            try {
              const parsed = inc.aiUrgentNeeds ? JSON.parse(inc.aiUrgentNeeds) : []
              return Array.isArray(parsed) ? parsed.slice(0, 6) : []
            } catch { return [] }
          })(),
      classificationSource: data.classificationSource || (source === 'SOS' ? 'system' : 'heuristic'),
      source,
    })
  }

  // Sort: priority first, then most recent.
  items.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (pa !== 0) return pa
    return new Date(b.timeReceived).getTime() - new Date(a.timeReceived).getTime()
  })

  return {
    items: items.slice(0, limit),
    counts,
    generatedAt: new Date().toISOString(),
  }
}
