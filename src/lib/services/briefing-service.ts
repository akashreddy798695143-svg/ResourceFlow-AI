// GAME-CHANGER #4 — AI SITUATION BRIEF
// GAME-CHANGER #10 — 30-SECOND COMMAND BRIEFING
// ------------------------------------------------------------------
// Generates a short, actionable operational brief for an incident from REAL
// application data only: the incident row, its timeline events, tasks,
// assignments, live responder positions and citizen updates.
//
// DESIGN RULES:
//  * Facts come from the database. The AI's job is to SUMMARISE, not to invent.
//    Every field we hand the model is a real value; missing values are passed as
//    "unknown" so the model cannot fill the gap with a guess.
//  * Each brief is persisted as an immutable SituationBrief row for audit.
//  * Regeneration is skipped when nothing material changed (compare inputHash),
//    which keeps the command center fast and avoids needless AI calls.

import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { askAI, extractJson } from '@/lib/ai-client'
import { haversineKm } from '@/lib/agents/resource-agent'

export interface CommandBriefing {
  incidentId: string
  incidentCode: string
  summary: string
  // The 30-second card fields (GAME-CHANGER #10)
  fields: {
    incident: string
    location: string
    severity: string
    peopleAffected: string
    currentNeeds: string[]
    assignedResources: string[]
    responderEta: string
    roadStatus: string
    communicationStatus: string
    latestUpdate: string
    currentBlocker: string
    aiRecommendation: string
  }
  // Full situation brief (GAME-CHANGER #4)
  narrative: string
  source: 'ai' | 'derived'
  modelNote?: string
  generatedAt: string
  cached: boolean
}

function parseJsonArray(v: string | null | undefined): string[] {
  if (!v) return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : []
  } catch {
    return []
  }
}

const EVENT_LABELS: Record<string, string> = {
  INCIDENT_CREATED: 'Citizen reported incident',
  INCIDENT_ANALYZING: 'AI analysis started',
  INCIDENT_ANALYZED: 'AI analysis completed',
  INCIDENT_CLUSTERED: 'Reports clustered',
  RISK_CALCULATED: 'Risk score calculated',
  RESOURCE_RECOMMENDED: 'Resource recommended',
  APPROVAL_REQUIRED: 'Officer approval requested',
  APPROVAL_GRANTED: 'Officer approved assignment',
  APPROVAL_REJECTED: 'Officer rejected assignment',
  RESOURCE_ASSIGNED: 'Resource assigned',
  RESOURCE_CONFLICT: 'Resource conflict detected',
  REASSIGNMENT: 'Reassignment triggered',
  RESPONSE_ACKNOWLEDGED: 'Responder acknowledged',
  RESPONSE_STARTED: 'Responder en route',
  RESPONSE_ARRIVED: 'Responder arrived on scene',
  RESPONSE_DELAYED: 'Response delayed',
  INCIDENT_ESCALATED: 'Incident escalated',
  INCIDENT_RESOLVED: 'Incident resolved',
  CITIZEN_QUICK_UPDATE: 'Citizen sent an update',
  SOS_ONE_TAP: 'One-tap SOS received',
  TASK_CREATED: 'Response task created',
  TASK_ASSIGNED: 'Task assigned',
  TASK_COMPLETED: 'Task completed',
  BROADCAST_SENT: 'Emergency broadcast sent',
  BOTTLENECK_DETECTED: 'Bottleneck detected',
}

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.replace(/_/g, ' ')
}

/**
 * Gather every real fact we hold about an incident into a compact context block.
 * Everything here is read from the database — nothing is synthesised.
 */
async function gatherIncidentContext(incidentId: string) {
  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: {
      ResourceAssignment: {
        where: { status: 'ASSIGNED' },
        include: { Resource: true },
      },
    },
  })
  if (!incident) return null

  const [events, tasks, bottlenecks, respondedBy] = await Promise.all([
    db.incidentEvent.findMany({
      where: { incidentId },
      orderBy: { createdAt: 'asc' },
      take: 120,
    }),
    db.incidentTask.findMany({ where: { incidentId }, orderBy: { priority: 'asc' } }),
    db.responseBottleneck.findMany({ where: { incidentId, status: 'OPEN' }, orderBy: { createdAt: 'desc' } }),
    db.user.findUnique({ where: { id: incident.reportedById }, select: { name: true } }),
  ])

  // Live responder position (most recent update for the assigned resource).
  let responderEtaMinutes: number | null = null
  let responderDistanceKm: number | null = null
  let responderLastUpdate: string | null = null
  let responderStatus: string | null = null

  const assigned = incident.ResourceAssignment[0]
  if (assigned) {
    responderStatus = assigned.Resource.status
    const latest = await db.responderLocationUpdate.findFirst({
      where: { resourceId: assigned.resourceId },
      orderBy: { timestamp: 'desc' },
    })
    if (latest) {
      responderLastUpdate = latest.timestamp.toISOString()
      responderDistanceKm = Math.round(haversineKm(latest.latitude, latest.longitude, incident.latitude, incident.longitude) * 100) / 100
      // 30 km/h is a conservative urban emergency-vehicle average. We label this
      // as an estimate derived from the last known position — never as live routing.
      responderEtaMinutes = Math.max(1, Math.round((responderDistanceKm / 30) * 60))
    }
  }

  const latestCitizenUpdate = [...events].reverse().find((e) => e.eventType === 'CITIZEN_QUICK_UPDATE' || e.eventType === 'SOS_ONE_TAP')

  return {
    incident,
    events,
    tasks,
    bottlenecks,
    reporterName: respondedBy?.name ?? 'Unknown',
    assigned,
    responderEtaMinutes,
    responderDistanceKm,
    responderLastUpdate,
    responderStatus,
    latestCitizenUpdate,
  }
}

/**
 * Deterministic briefing — always available, built purely from real rows.
 * This is the safety net when the AI is unavailable, and the fact base the AI
 * is asked to condense.
 */
function buildDerivedBriefing(ctx: NonNullable<Awaited<ReturnType<typeof gatherIncidentContext>>>) {
  const { incident, events, tasks, bottlenecks, assigned } = ctx

  const needs = parseJsonArray(incident.aiUrgentNeeds)
  const taskTitles = tasks.filter((t) => t.status !== 'COMPLETED').map((t) => t.title)

  const roadStatus = incident.aiRoadBlocked
    ? 'Access route reported blocked'
    : incident.aiRoadBlocked === false
    ? 'No blockage reported'
    : 'Unknown — not confirmed'

  const commStatus = ctx.responderLastUpdate
    ? (() => {
        const ageSec = Math.round((Date.now() - new Date(ctx.responderLastUpdate!).getTime()) / 1000)
        return ageSec < 120 ? 'LIVE' : ageSec < 600 ? 'DELAYED' : 'LAST UPDATE'
      })()
    : 'No live responder telemetry'

  const responderEta = ctx.responderEtaMinutes != null
    ? `~${ctx.responderEtaMinutes} min (est. from last reported position)`
    : assigned
    ? 'Responder assigned, awaiting first position update'
    : 'No responder assigned'

  const peopleAffected = incident.aiPeopleAffected != null
    ? `${incident.aiPeopleAffected} (AI estimate)`
    : 'Unknown — not confirmed'

  const latestUpdate = ctx.latestCitizenUpdate
    ? `${eventLabel(ctx.latestCitizenUpdate.eventType)} — ${ctx.latestCitizenUpdate.createdAt.toLocaleTimeString()}`
    : events.length
    ? `${eventLabel(events[events.length - 1].eventType)}`
    : 'No updates recorded'

  const blocker = bottlenecks[0]
    ? `${bottlenecks[0].title}: ${bottlenecks[0].detail}`
    : 'None detected'

  const recommendation = bottlenecks[0]
    ? bottlenecks[0].recommendedAction
    : tasks.some((t) => t.status === 'PENDING')
    ? 'Assign pending response tasks to available resources.'
    : assigned
    ? 'Monitor responder progress and confirm arrival.'
    : 'No resource assigned — recommend dispatching the nearest eligible resource.'

  const openTasks = tasks.filter((t) => t.status !== 'COMPLETED')
  const typeLabel = incident.type.split('_').join(' ')
  const statusLabel = incident.status.split('_').join(' ').toLowerCase()

  const summaryParts = [
    typeLabel + ' incident at ' + incident.location + '.',
    incident.aiPeopleAffected != null
      ? 'Approximately ' + incident.aiPeopleAffected + ' people affected (AI estimate).'
      : 'Number of affected people not confirmed.',
    assigned
      ? assigned.Resource.resourceCode + ' (' + assigned.Resource.name + ') assigned.'
      : 'No resource assigned yet.',
    ctx.responderEtaMinutes != null
      ? 'Nearest responder ETA about ' + ctx.responderEtaMinutes + ' minutes.'
      : 'Responder ETA unavailable.',
  ]

  const narrativeParts = [
    summaryParts.join(' '),
    'Status: ' + statusLabel + '.',
    needs.length ? 'Reported needs: ' + needs.join(', ') + '.' : '',
    openTasks.length ? 'Open response tasks: ' + openTasks.length + '.' : '',
    blocker !== 'None detected' ? 'Current blocker: ' + blocker + '.' : 'No open bottlenecks.',
  ].filter(Boolean)

  return {
    summary: summaryParts.join(' '),
    narrative: narrativeParts.join(' '),
    fields: {
      incident: incident.incidentCode + ' — ' + typeLabel,
      location: incident.location,
      severity:
        (incident.riskLevel ?? incident.aiSeverity ?? 'UNASSESSED') +
        (incident.riskScore != null ? ' (risk ' + Math.round(incident.riskScore) + '/100)' : ''),
      peopleAffected,
      currentNeeds: needs.length ? needs : taskTitles.length ? taskTitles : ['Not yet assessed'],
      assignedResources: assigned
        ? [assigned.Resource.resourceCode + ' — ' + assigned.Resource.name + ' (' + assigned.Resource.status + ')']
        : ['None assigned'],
      responderEta,
      roadStatus,
      communicationStatus: commStatus,
      latestUpdate,
      currentBlocker: blocker,
      aiRecommendation: recommendation,
    },
  }
}

const BRIEF_SYSTEM = `You are the AI operations briefer for a government disaster-response command center.
You receive REAL incident facts as JSON. Write a SHORT, decisive operational brief.

Return STRICT JSON ONLY:
{
  "summary": "<2-3 sentence situation summary>",
  "recommendation": "<the single most useful next action for the duty officer>"
}

Hard rules:
- Use ONLY the facts provided. If a field is "unknown" or null, say it is not confirmed. NEVER invent numbers, casualties, road conditions or resource availability.
- Be concrete and terse — this is read under time pressure by an officer handling many incidents.
- Do not use markdown, bullet characters or headings.
- Do not repeat the raw JSON back.
- Output must be valid JSON parseable by JSON.parse.`

/**
 * Generate (or reuse) the situation brief for an incident.
 * Safe to call from the command center on every poll.
 */
export async function getSituationBrief(
  incidentId: string,
  opts: { refresh?: boolean } = {}
): Promise<CommandBriefing | null> {
  const ctx = await gatherIncidentContext(incidentId)
  if (!ctx) return null

  const derived = buildDerivedBriefing(ctx)

  // Hash the material inputs so we can skip regeneration when nothing changed.
  const inputHash = createHash('sha256')
    .update(
      JSON.stringify({
        status: ctx.incident.status,
        risk: ctx.incident.riskScore,
        level: ctx.incident.riskLevel,
        people: ctx.incident.aiPeopleAffected,
        needs: ctx.incident.aiUrgentNeeds,
        road: ctx.incident.aiRoadBlocked,
        assigned: ctx.assigned?.resourceId ?? null,
        events: ctx.events.length,
        tasks: ctx.tasks.map((t) => `${t.id}:${t.status}`),
        bottlenecks: ctx.bottlenecks.map((b) => `${b.id}:${b.kind}`),
        eta: ctx.responderEtaMinutes,
      })
    )
    .digest('hex')

  if (!opts.refresh) {
    const cached = await db.situationBrief.findFirst({
      where: { incidentId, kind: 'COMMAND' },
      orderBy: { createdAt: 'desc' },
    })
    if (cached && cached.inputHash === inputHash) {
      const content = cached.content as any
      return {
        incidentId,
        incidentCode: ctx.incident.incidentCode,
        summary: cached.summary,
        fields: content?.fields ?? derived.fields,
        narrative: content?.narrative ?? derived.narrative,
        source: cached.source === 'ai' ? 'ai' : 'derived',
        generatedAt: cached.createdAt.toISOString(),
        cached: true,
      }
    }
  }

  // Ask the AI to condense the real facts. If it fails we keep the derived brief.
  let summary = derived.summary
  let narrative = derived.narrative
  let source: 'ai' | 'derived' = 'derived'
  let modelNote: string | undefined

  const facts = {
    incidentCode: ctx.incident.incidentCode,
    type: ctx.incident.type,
    status: ctx.incident.status,
    location: ctx.incident.location,
    severity: ctx.incident.aiSeverity ?? null,
    riskScore: ctx.incident.riskScore ?? null,
    riskLevel: ctx.incident.riskLevel ?? null,
    peopleAffectedAiEstimate: ctx.incident.aiPeopleAffected ?? null,
    reportedNeeds: parseJsonArray(ctx.incident.aiUrgentNeeds),
    roadBlocked: ctx.incident.aiRoadBlocked ?? null,
    infrastructureDamage: parseJsonArray(ctx.incident.aiInfrastructureDamage),
    assignedResource: ctx.assigned
      ? {
          code: ctx.assigned.Resource.resourceCode,
          name: ctx.assigned.Resource.name,
          status: ctx.assigned.Resource.status,
        }
      : null,
    responderEtaMinutes: ctx.responderEtaMinutes,
    responderDistanceKm: ctx.responderDistanceKm,
    responderLastUpdate: ctx.responderLastUpdate,
    openTasks: ctx.tasks.filter((t) => t.status !== 'COMPLETED').map((t) => ({ title: t.title, status: t.status })),
    openBottlenecks: ctx.bottlenecks.map((b) => ({ kind: b.kind, title: b.title, detail: b.detail })),
    recentTimeline: ctx.events.slice(-12).map((e) => ({
      at: e.createdAt.toISOString(),
      event: eventLabel(e.eventType),
    })),
    latestCitizenUpdate: ctx.latestCitizenUpdate
      ? { at: ctx.latestCitizenUpdate.createdAt.toISOString(), event: eventLabel(ctx.latestCitizenUpdate.eventType) }
      : null,
  }

  const res = await askAI(BRIEF_SYSTEM, JSON.stringify(facts, null, 2))
  if (res.ok) {
    const parsed = extractJson<{ summary?: string; recommendation?: string }>(res.content)
    if (parsed?.summary && String(parsed.summary).trim()) {
      summary = String(parsed.summary).trim().slice(0, 600)
      narrative = `${summary} ${derived.narrative}`.slice(0, 1600)
      if (parsed.recommendation && String(parsed.recommendation).trim()) {
        derived.fields.aiRecommendation = String(parsed.recommendation).trim().slice(0, 400)
      }
      source = 'ai'
    }
  } else {
    modelNote = res.error
  }

  // Persist the snapshot (audit trail + cache).
  try {
    await db.situationBrief.create({
      data: {
        incidentId,
        kind: 'COMMAND',
        summary,
        content: { fields: derived.fields, narrative } as any,
        source,
        inputHash,
      },
    })
  } catch (e) {
    console.error('[briefing] failed to persist brief:', e)
  }

  return {
    incidentId,
    incidentCode: ctx.incident.incidentCode,
    summary,
    fields: derived.fields,
    narrative,
    source,
    modelNote,
    generatedAt: new Date().toISOString(),
    cached: false,
  }
}

/**
 * Command-center overview: the N most critical active incidents, each with a
 * 30-second brief. Used by the Command Center and by the priority queue view.
 */
export async function getCommandBriefingBoard(limit = 6): Promise<{
  items: CommandBriefing[]
  generatedAt: string
}> {
  const active = await db.incident.findMany({
    where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
    orderBy: [{ riskScore: 'desc' }, { createdAt: 'desc' }],
    take: Math.min(Math.max(limit, 1), 20),
    select: { id: true },
  })

  const items: CommandBriefing[] = []
  for (const inc of active) {
    try {
      const brief = await getSituationBrief(inc.id)
      if (brief) items.push(brief)
    } catch (e) {
      console.error('[briefing] failed for incident', inc.id, e)
    }
  }

  return { items, generatedAt: new Date().toISOString() }
}
