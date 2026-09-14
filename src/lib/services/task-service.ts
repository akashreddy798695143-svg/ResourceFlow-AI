// GAME-CHANGER #8 — AI TASK ASSIGNMENT
// ------------------------------------------------------------------
// Divides an incident response into discrete, trackable tasks and recommends a
// resource for each. This replaces "one resource per incident" with an
// actionable task board.
//
// DESIGN RULES:
//  * AI recommends the task list and the task→resource mapping.
//  * A human officer must approve any task that maps to a real resource before
//    the assignment becomes operational (approveTask below).
//  * Task status transitions are explicit and each one writes a timeline event,
//    so the incident timeline stays a faithful audit trail.
//  * Resources are only ever chosen from rows that actually exist in the DB.

import { db } from '@/lib/db'
import { askAI, extractJson } from '@/lib/ai-client'
import { recordIncidentEvent, recordAudit } from '@/lib/events'
import { haversineKm, estimateEtaMinutes } from '@/lib/agents/resource-agent'
import type { ResourceType } from '@prisma/client'

export type TaskStatus = 'PENDING' | 'ASSIGNED' | 'ACCEPTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED'

export const TASK_STATUSES: TaskStatus[] = [
  'PENDING', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED',
]

// Which resource types can serve each task category.
const CATEGORY_RESOURCE_TYPES: Record<string, ResourceType[]> = {
  RESCUE: ['RESCUE_TEAM', 'EMERGENCY_VEHICLE'],
  MEDICAL: ['AMBULANCE', 'MEDICAL_SUPPLY'],
  AMBULANCE: ['AMBULANCE'],
  WATER: ['WATER_SUPPLY'],
  FOOD: ['FOOD_SUPPLY'],
  SHELTER: ['EMERGENCY_VEHICLE'],
  ROUTE_CLEARANCE: ['EMERGENCY_VEHICLE', 'RESCUE_TEAM'],
  FIRE: ['FIRE_TEAM'],
  MONITORING: ['EMERGENCY_VEHICLE'],
  OTHER: ['RESCUE_TEAM', 'EMERGENCY_VEHICLE'],
}

export function resourceTypesForCategory(category: string): ResourceType[] {
  return CATEGORY_RESOURCE_TYPES[String(category || 'OTHER').toUpperCase()] ?? CATEGORY_RESOURCE_TYPES.OTHER
}

const TASK_SYSTEM = `You are a disaster-response task planner for an emergency command center.
You receive REAL incident facts. Break the response into concrete, assignable tasks.

Return STRICT JSON ONLY:
{
  "tasks": [
    {
      "title": "<short imperative task title, e.g. 'Rescue trapped residents'>",
      "description": "<one sentence of context>",
      "category": "RESCUE|MEDICAL|AMBULANCE|WATER|FOOD|SHELTER|ROUTE_CLEARANCE|FIRE|MONITORING|OTHER",
      "priority": <1=highest .. 5=lowest>,
      "reasoning": "<why this task matters for this incident>"
    }
  ]
}

Rules:
- Produce between 3 and 7 tasks. Order them by operational priority.
- Base tasks ONLY on the facts provided (incident type, reported needs, people affected, road status). Never invent casualties, locations or resources.
- Always include a MONITORING task so the officer keeps situational awareness.
- Do not include resource names or codes — the system maps resources.
- Output valid JSON parseable by JSON.parse.`

/**
 * Generate and persist the AI task breakdown for an incident.
 * Existing non-completed tasks are preserved; only new categories are added so
 * repeat runs do not duplicate the board.
 */
export async function generateTasksForIncident(incidentId: string, createdById?: string) {
  const incident = await db.incident.findUnique({ where: { id: incidentId } })
  if (!incident) throw new Error('Incident not found')

  const existing = await db.incidentTask.findMany({ where: { incidentId } })

  let needs: string[] = []
  try {
    const parsed = incident.aiUrgentNeeds ? JSON.parse(incident.aiUrgentNeeds) : []
    needs = Array.isArray(parsed) ? parsed.map((n) => String(n)) : []
  } catch { needs = [] }

  const facts = {
    incidentCode: incident.incidentCode,
    type: incident.type,
    description: incident.description.slice(0, 800),
    location: incident.location,
    status: incident.status,
    severity: incident.aiSeverity ?? null,
    riskLevel: incident.riskLevel ?? null,
    peopleAffected: incident.aiPeopleAffected ?? null,
    reportedNeeds: needs,
    roadBlocked: incident.aiRoadBlocked ?? null,
  }

  const res = await askAI(TASK_SYSTEM, JSON.stringify(facts, null, 2))

  let planned: {
    title: string
    description?: string
    category?: string
    priority?: number
    reasoning?: string
  }[] = []
  let source: 'ai' | 'system' = 'system'

  if (res.ok) {
    const parsed = extractJson<{ tasks?: typeof planned }>(res.content)
    if (Array.isArray(parsed?.tasks) && parsed.tasks.length > 0) {
      planned = parsed.tasks.slice(0, 7)
      source = 'ai'
    }
  }

  // Deterministic fallback so the board is never empty when AI is down.
  if (planned.length === 0) {
    const t = incident.type
    const base: typeof planned = []
    if (['FLOOD', 'CYCLONE', 'HEAVY_RAINFALL'].includes(t)) {
      base.push(
        { title: 'Rescue trapped residents', category: 'RESCUE', priority: 1, reasoning: 'Flooding with possible entrapment.' },
        { title: 'Deliver drinking water', category: 'WATER', priority: 2, reasoning: 'Clean water is a critical early need in flooding.' },
        { title: 'Clear access route', category: 'ROUTE_CLEARANCE', priority: 3, reasoning: 'Blocked routes delay all other response.' },
      )
    } else if (['EARTHQUAKE', 'BUILDING_COLLAPSE'].includes(t)) {
      base.push(
        { title: 'Search and rescue trapped victims', category: 'RESCUE', priority: 1, reasoning: 'Structural collapse with possible entrapment.' },
        { title: 'Dispatch ambulance', category: 'AMBULANCE', priority: 2, reasoning: 'Injuries are expected in structural collapse.' },
        { title: 'Assess structural safety', category: 'MONITORING', priority: 3, reasoning: 'Secondary collapse risk for responders.' },
      )
    } else {
      base.push(
        { title: 'Dispatch initial response', category: 'RESCUE', priority: 1, reasoning: 'Immediate response required for ' + t.replace(/_/g, ' ') + '.' },
        { title: 'Assess situation on scene', category: 'MONITORING', priority: 2, reasoning: 'Situational awareness before committing more resources.' },
      )
    }
    // Always include food/water when people are affected in numbers.
    if ((incident.aiPeopleAffected ?? 0) >= 50) {
      base.push({ title: 'Provide food supplies', category: 'FOOD', priority: 4, reasoning: 'Affected population size warrants relief supply.' })
    }
    base.push({ title: 'Monitor affected zone', category: 'MONITORING', priority: 5, reasoning: 'Keep command center situational awareness.' })
    planned = base
  }

  const existingTitles = new Set(existing.map((t) => t.title.toLowerCase().trim()))
  const createdTasks: { id: string; title: string }[] = []

  for (const p of planned) {
    const title = String(p.title || '').trim().slice(0, 200)
    if (!title) continue
    if (existingTitles.has(title.toLowerCase())) continue

    const category = String(p.category || 'OTHER').toUpperCase()
    const eligible = resourceTypesForCategory(category)

    const row = await db.incidentTask.create({
      data: {
        incidentId,
        title,
        description: p.description ? String(p.description).slice(0, 500) : null,
        category,
        priority: Math.min(Math.max(Number(p.priority) || 3, 1), 5),
        status: 'PENDING',
        requiredResourceType: eligible[0] ?? null,
        source,
        reasoning: p.reasoning ? String(p.reasoning).slice(0, 400) : null,
        createdById: createdById ?? null,
      },
    })
    createdTasks.push(row)

    await recordIncidentEvent(incidentId, 'TASK_CREATED', {
      label: 'Task created: ' + title,
      taskId: row.id,
      category,
      priority: row.priority,
      source,
    })
  }

  if (createdTasks.length > 0) {
    await recordAudit({
      userId: createdById,
      action: 'TASKS_GENERATED',
      entityId: incidentId,
      newState: createdTasks.length + ' tasks (' + source + ')',
      reason: 'AI task breakdown for incident response',
    })
  }

  return { created: createdTasks.length, tasks: await listTasks(incidentId) }
}

/**
 * Recommend the best available resource for one task.
 * Returns null when nothing eligible is available — never a fabricated unit.
 */
export async function recommendResourceForTask(taskId: string) {
  const task = await db.incidentTask.findUnique({
    where: { id: taskId },
    include: { Incident: true },
  })
  if (!task) throw new Error('Task not found')

  const eligibleTypes = resourceTypesForCategory(task.category)

  const candidates = await db.resource.findMany({
    where: { type: { in: eligibleTypes }, status: 'AVAILABLE' },
  })
  if (candidates.length === 0) return null

  const inc = task.Incident

  // Score by distance, capacity and type match — mirrors the resource agent's logic.
  const scored = candidates.map((r) => {
    const distanceKm = haversineKm(r.latitude, r.longitude, inc.latitude, inc.longitude)
    const etaMinutes = r.eta != null ? r.eta : estimateEtaMinutes(distanceKm)
    return { resource: r, distanceKm: Math.round(distanceKm * 100) / 100, etaMinutes }
  })

  scored.sort((a, b) => {
    if (a.etaMinutes !== b.etaMinutes) return a.etaMinutes - b.etaMinutes
    return b.resource.capacity - a.resource.capacity
  })

  const best = scored[0]
  return {
    taskId,
    recommended: {
      id: best.resource.id,
      code: best.resource.resourceCode,
      name: best.resource.name,
      type: best.resource.type,
      distanceKm: best.distanceKm,
      etaMinutes: best.etaMinutes,
      capacity: best.resource.capacity,
    },
    alternatives: scored.slice(1, 4).map((s) => ({
      id: s.resource.id,
      code: s.resource.resourceCode,
      name: s.resource.name,
      type: s.resource.type,
      distanceKm: s.distanceKm,
      etaMinutes: s.etaMinutes,
      capacity: s.resource.capacity,
    })),
    reasoning:
      best.resource.resourceCode + ' is the closest available ' + best.resource.type.replace(/_/g, ' ') +
      ', approximately ' + best.distanceKm + ' km away (about ' + best.etaMinutes + ' min).',
    source: 'deterministic' as const,
  }
}

/**
 * Officer approves a task→resource mapping, making it operational.
 * This is the human-approval gate required before dispatch.
 */
export async function approveTaskAssignment(params: {
  taskId: string
  resourceId: string
  userId: string
  userRole: string
  note?: string
}) {
  const task = await db.incidentTask.findUnique({
    where: { id: params.taskId },
    include: { Incident: true },
  })
  if (!task) throw new Error('Task not found')

  const resource = await db.resource.findUnique({ where: { id: params.resourceId } })
  if (!resource) throw new Error('Resource not found')

  if (resource.status === 'UNAVAILABLE') {
    throw new Error('Resource ' + resource.resourceCode + ' is unavailable. Choose an alternative.')
  }

  await db.incidentTask.update({
    where: { id: params.taskId },
    data: {
      status: 'ASSIGNED',
      assignedResourceId: params.resourceId,
      assignedById: params.userId,
      approvedById: params.userId,
      approvedAt: new Date(),
    },
  })

  // Reserve the resource so it cannot be double-booked.
  await db.resource.update({
    where: { id: params.resourceId },
    data: { status: 'ASSIGNED', lastUpdated: new Date() },
  })

  await db.resourceAssignment.create({
    data: {
      resourceId: params.resourceId,
      incidentId: task.incidentId,
      status: 'ASSIGNED',
      reason: 'Task assignment: ' + task.title + (params.note ? ' — ' + params.note : ''),
      assignedById: params.userId,
    },
  }).catch(() => { /* an existing assignment row is acceptable */ })

  await recordIncidentEvent(task.incidentId, 'TASK_ASSIGNED', {
    label: 'Task "' + task.title + '" assigned to ' + resource.resourceCode,
    taskId: params.taskId,
    resourceId: params.resourceId,
    resourceCode: resource.resourceCode,
  })

  await recordAudit({
    userId: params.userId,
    role: params.userRole,
    action: 'TASK_ASSIGNED',
    entityId: task.incidentId,
    previousState: task.status,
    newState: 'ASSIGNED -> ' + resource.resourceCode,
    reason: 'Officer approved task assignment: ' + task.title,
  })

  return { taskId: params.taskId, status: 'ASSIGNED', resourceCode: resource.resourceCode }
}

/**
 * Advance a task through its lifecycle. Every transition is a timeline event.
 */
export async function updateTaskStatus(params: {
  taskId: string
  status: TaskStatus
  userId: string
  userRole: string
  blockedReason?: string
}) {
  if (!TASK_STATUSES.includes(params.status)) throw new Error('Invalid task status')

  const task = await db.incidentTask.findUnique({ where: { id: params.taskId } })
  if (!task) throw new Error('Task not found')

  const data: any = { status: params.status }

  if (params.status === 'IN_PROGRESS' && !task.startedAt) data.startedAt = new Date()
  if (params.status === 'COMPLETED') data.completedAt = new Date()
  if (params.status === 'BLOCKED') data.blockedReason = params.blockedReason ?? 'Blocked — reason not recorded'

  await db.incidentTask.update({ where: { id: params.taskId }, data })

  // A completed task releases its resource back to the pool.
  if (params.status === 'COMPLETED' && task.assignedResourceId) {
    await db.resource.update({
      where: { id: task.assignedResourceId },
      data: { status: 'AVAILABLE', lastUpdated: new Date() },
    }).catch(() => {})
    await db.resourceAssignment.updateMany({
      where: { resourceId: task.assignedResourceId, incidentId: task.incidentId, status: 'ASSIGNED' },
      data: { status: 'COMPLETED' },
    }).catch(() => {})
  }

  await recordIncidentEvent(task.incidentId, params.status === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_STATUS_CHANGED', {
    label: 'Task "' + task.title + '" -> ' + params.status + (params.blockedReason ? ' (' + params.blockedReason + ')' : ''),
    taskId: params.taskId,
    previousStatus: task.status,
    status: params.status,
  })

  await recordAudit({
    userId: params.userId,
    role: params.userRole,
    action: 'TASK_STATUS_CHANGED',
    entityId: task.incidentId,
    previousState: task.status,
    newState: params.status,
    reason: params.blockedReason || 'Task "' + task.title + '" updated',
  })

  return { taskId: params.taskId, status: params.status }
}

export async function listTasks(incidentId: string) {
  const tasks = await db.incidentTask.findMany({
    where: { incidentId },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    include: {
      Resource: { select: { resourceCode: true, name: true, status: true } },
      User: { select: { name: true, role: true } },
    },
  })

  return tasks.map((t) => ({
    id: t.id,
    incidentId: t.incidentId,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    requiredResourceType: t.requiredResourceType,
    assignedResourceId: t.assignedResourceId,
    resourceCode: t.Resource?.resourceCode ?? null,
    resourceName: t.Resource?.name ?? null,
    resourceStatus: t.Resource?.status ?? null,
    approvedById: t.approvedById,
    approvedByName: t.User?.name ?? null,
    approvedAt: t.approvedAt?.toISOString() ?? null,
    startedAt: t.startedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    blockedReason: t.blockedReason,
    source: t.source,
    reasoning: t.reasoning,
    createdAt: t.createdAt.toISOString(),
  }))
}
