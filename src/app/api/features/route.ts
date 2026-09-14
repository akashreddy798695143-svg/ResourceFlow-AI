// GAME-CHANGER FEATURES API — single secure entry point.
//
//   GET  /api/features?feature=<name>[&incidentId=&targetLang=&limit=&...]
//   POST /api/features  { action, ...payload }
//
// Every call is authenticated server-side. Roles are re-verified against the
// database (never trusted from the client). Citizens are strictly scoped to
// incidents they reported. AI only ever RECOMMENDS — officers approve.

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError, roleAllows } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import {
  QUICK_ACTIONS,
  getPriorityQueue,
  sendQuickActionUpdate,
} from '@/lib/services/priority-queue-service'
import {
  getSituationBrief,
  getCommandBriefingBoard,
} from '@/lib/services/briefing-service'
import {
  runBottleneckSweep,
  listBottlenecks,
  resolveBottleneck,
} from '@/lib/services/bottleneck-service'
import {
  generateTasksForIncident,
  listTasks,
  recommendResourceForTask,
  approveTaskAssignment,
  updateTaskStatus,
  TASK_STATUSES,
  type TaskStatus,
} from '@/lib/services/task-service'
import {
  createBroadcast,
  listBroadcasts,
  getBroadcastDeliveryReport,
} from '@/lib/services/broadcast-service'
import {
  getCommsHealth,
  formatLastUpdate,
} from '@/lib/services/comms-health-service'
import {
  translateChatMessage,
  SUPPORTED_LANGUAGES,
  isSupportedLang,
} from '@/lib/services/translation-service'

const OFFICER_ROLES = ['DISASTER_OFFICER', 'ADMIN'] as const

/** Citizen-safety guard: a citizen may only touch incidents they reported. */
async function assertIncidentAccess(user: { id: string; role: string }, incidentId?: string | null) {
  if (!incidentId) return true
  const inc = await db.incident.findUnique({ where: { id: incidentId }, select: { reportedById: true } })
  if (!inc) return false
  if (user.role === 'CITIZEN') return inc.reportedById === user.id
  // Responders may see incidents they are assigned to; officers/admins see all.
  if (user.role === 'RESPONDER') {
    const assignment = await db.resourceAssignment.findFirst({
      where: { incidentId },
      select: { id: true },
    })
    return !!assignment
  }
  return true
}

// ────────────────────────────
// GET
// ────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const url = new URL(req.url)
    const feature = url.searchParams.get('feature')
    const incidentId = url.searchParams.get('incidentId') || undefined
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Math.max(1, Math.min(100, Number(limitRaw))) : undefined

    switch (feature) {
      // #1 One-tap emergency communication — available quick actions
      case 'quick-actions':
        return ok({ actions: QUICK_ACTIONS })

      // #3 Emergency message priority queue (officer command center)
      case 'priority-queue': {
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        if (incidentId && !(await assertIncidentAccess(user, incidentId))) return err('Forbidden', 403)
        const minPriority = url.searchParams.get('minPriority') as any
        const queue = await getPriorityQueue({
          limit: limit ?? 40,
          incidentId,
          minPriority: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(minPriority) ? minPriority : undefined,
        })
        return ok(queue)
      }

      // #4 AI situation brief for one incident
      case 'brief': {
        if (!incidentId) return err('incidentId required', 422)
        if (!(await assertIncidentAccess(user, incidentId))) return err('Forbidden', 403)
        // Citizens get a reduced, public-safe brief (no internal resource reasoning).
        const brief = await getSituationBrief(incidentId, {
          refresh: url.searchParams.get('refresh') === '1',
        })
        if (!brief) return err('Incident not found', 404)
        if (user.role === 'CITIZEN') {
          return ok({
            incidentId: brief.incidentId,
            incidentCode: brief.incidentCode,
            summary: brief.summary,
            // public-safe subset only
            fields: {
              incident: brief.fields.incident,
              location: brief.fields.location,
              severity: brief.fields.severity,
              peopleAffected: brief.fields.peopleAffected,
              responderEta: brief.fields.responderEta,
              communicationStatus: brief.fields.communicationStatus,
              latestUpdate: brief.fields.latestUpdate,
            },
            source: brief.source,
            generatedAt: brief.generatedAt,
          })
        }
        return ok(brief)
      }

      // #10 30-second command briefing board (officer)
      case 'command-briefing': {
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        return ok(await getCommandBriefingBoard(limit ?? 6))
      }

      // #9 Response bottlenecks
      case 'bottlenecks': {
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        if (incidentId && !(await assertIncidentAccess(user, incidentId))) return err('Forbidden', 403)
        return ok({ bottlenecks: await listBottlenecks({ incidentId, limit: limit ?? 40 }) })
      }

      // #8 AI task assignment
      case 'tasks': {
        if (!incidentId) return err('incidentId required', 422)
        if (!(await assertIncidentAccess(user, incidentId))) return err('Forbidden', 403)
        return ok({ tasks: await listTasks(incidentId) })
      }

      // #7 Impact-zone emergency broadcasts
      case 'broadcasts': {
        const activeOnly = url.searchParams.get('activeOnly') === '1'
        const items = await listBroadcasts({ viewer: user, activeOnly, limit: limit ?? 30 })
        return ok({ broadcasts: items })
      }

      case 'broadcast-report': {
        if (!OFFICER_ROLES.includes(user.role as any)) return err('Forbidden', 403)
        const broadcastId = url.searchParams.get('broadcastId')
        if (!broadcastId) return err('broadcastId required', 422)
        return ok(await getBroadcastDeliveryReport(broadcastId))
      }

      // #6 Communication health / fallback
      case 'comms-health': {
        if (incidentId && !(await assertIncidentAccess(user, incidentId))) return err('Forbidden', 403)
        const health = await getCommsHealth({ incidentId, persist: true })
        return ok({
          ...health,
          lastUpdateLabel: formatLastUpdate(health.secondsSinceLastUpdate),
        })
      }

      // #2 Translation metadata (supported languages)
      case 'languages':
        return ok({ languages: SUPPORTED_LANGUAGES })

      default:
        return err('Unknown feature', 422)
    }
  } catch (e) {
    return handleAuthError(e)
  }
}

// ────────────────────────────
// POST
// ────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = parseBody(await req.json())
    const action = String(body?.action || '')

    switch (action) {
      // #1 One-tap structured emergency communication
      case 'quick-action': {
        const incidentId = String(body?.incidentId || '')
        if (!incidentId) return err('incidentId required', 422)
        if (!(await assertIncidentAccess(user, incidentId))) return err('Forbidden', 403)
        const actionKey = String(body?.actionKey || '')
        if (!QUICK_ACTIONS.some((a) => a.key === actionKey)) return err('Unknown quick action', 422)

        // Location consent: coordinates are only stored when the client supplies
        // them from an explicit, user-approved GPS reading.
        const lat = Number(body?.latitude)
        const lng = Number(body?.longitude)
        const latOk = Number.isFinite(lat) && Math.abs(lat) <= 90
        const lngOk = Number.isFinite(lng) && Math.abs(lng) <= 180

        const result = await sendQuickActionUpdate({
          incidentId,
          actionKey,
          userId: user.id,
          userRole: user.role,
          latitude: latOk ? lat : null,
          longitude: lngOk ? lng : null,
          accuracy: Number.isFinite(Number(body?.accuracy)) ? Number(body.accuracy) : null,
          note: body?.note ? String(body.note).slice(0, 500) : null,
          language: body?.language ? String(body.language).slice(0, 5) : null,
        })
        return ok(result, 201)
      }

      // #2 AI translation of a chat message (original is always preserved)
      case 'translate': {
        const messageId = String(body?.messageId || '')
        const targetLang = String(body?.targetLang || '')
        if (!messageId) return err('messageId required', 422)
        if (!isSupportedLang(targetLang)) return err('targetLang must be en, te or hi', 422)

        // Authorize: only the two conversation participants may read the thread.
        const message = await db.chatMessage.findUnique({
          where: { id: messageId },
          include: { conversation: true },
        })
        if (!message) return err('Message not found', 404)
        const isParticipant =
          message.conversation.participantA === user.id || message.conversation.participantB === user.id
        if (!isParticipant) return err('Forbidden', 403)

        const result = await translateChatMessage({
          messageId,
          targetLang,
          requestedById: user.id,
          refresh: body?.refresh === true,
        })
        return ok({
          messageId,
          original: result.original,
          translated: result.translated,
          sourceLang: result.sourceLang,
          targetLang: result.targetLang,
          source: result.source,
          cached: result.cached,
          confidence: result.confidence ?? null,
          // Explicit label so the UI can never present a translation as the original.
          label: result.source === 'ai' ? 'AI translation' : 'Translation unavailable',
          error: result.error ?? null,
        })
      }

      // #4/#10 Force a brief refresh
      case 'refresh-brief': {
        const incidentId = String(body?.incidentId || '')
        if (!incidentId) return err('incidentId required', 422)
        if (!(await assertIncidentAccess(user, incidentId))) return err('Forbidden', 403)
        const brief = await getSituationBrief(incidentId, { refresh: true })
        if (!brief) return err('Incident not found', 404)
        return ok(brief)
      }

      // #8 Generate the AI task breakdown (officer approves later)
      case 'generate-tasks': {
        if (!roleAllows('advanced:act', user.role)) return err('Forbidden', 403)
        const incidentId = String(body?.incidentId || '')
        if (!incidentId) return err('incidentId required', 422)
        return ok(await generateTasksForIncident(incidentId, user.id))
      }

      case 'recommend-task-resource': {
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        const taskId = String(body?.taskId || '')
        if (!taskId) return err('taskId required', 422)
        const rec = await recommendResourceForTask(taskId)
        if (!rec) {
          return ok({
            taskId,
            recommended: null,
            alternatives: [],
            reasoning: 'No eligible resource is currently available for this task.',
          })
        }
        return ok(rec)
      }

      // #8 HUMAN APPROVAL GATE for task→resource assignment
      case 'approve-task': {
        if (!roleAllows('advanced:act', user.role)) return err('Forbidden', 403)
        const taskId = String(body?.taskId || '')
        const resourceId = String(body?.resourceId || '')
        if (!taskId || !resourceId) return err('taskId and resourceId required', 422)
        return ok(
          await approveTaskAssignment({
            taskId,
            resourceId,
            userId: user.id,
            userRole: user.role,
            note: body?.note ? String(body.note).slice(0, 400) : undefined,
          })
        )
      }

      case 'update-task-status': {
        const taskId = String(body?.taskId || '')
        const status = String(body?.status || '') as TaskStatus
        if (!taskId) return err('taskId required', 422)
        if (!TASK_STATUSES.includes(status)) return err('Invalid task status', 422)

        // Responders may progress tasks assigned to them; officers/admins may always.
        const task = await db.incidentTask.findUnique({ where: { id: taskId } })
        if (!task) return err('Task not found', 404)
        if (user.role === 'CITIZEN') return err('Forbidden', 403)
        if (user.role === 'RESPONDER' && task.assignedResourceId) {
          const owns = await db.resourceAssignment.findFirst({
            where: { resourceId: task.assignedResourceId, incidentId: task.incidentId },
            select: { id: true },
          })
          if (!owns) return err('Forbidden', 403)
        }

        return ok(
          await updateTaskStatus({
            taskId,
            status,
            userId: user.id,
            userRole: user.role,
            blockedReason: body?.blockedReason ? String(body.blockedReason).slice(0, 400) : undefined,
          })
        )
      }

      // #9 Run the bottleneck sweep on demand (officer)
      case 'run-bottleneck-sweep': {
        if (!roleAllows('advanced:act', user.role)) return err('Forbidden', 403)
        const incidentId = body?.incidentId ? String(body.incidentId) : undefined
        if (incidentId && !(await assertIncidentAccess(user, incidentId))) return err('Forbidden', 403)
        return ok(await runBottleneckSweep({ incidentId, limit: body?.limit }))
      }

      // #9 Officer decision on an AI recommendation
      case 'resolve-bottleneck': {
        if (!roleAllows('advanced:act', user.role)) return err('Forbidden', 403)
        const bottleneckId = String(body?.bottleneckId || '')
        const decision = String(body?.decision || '')
        if (!bottleneckId) return err('bottleneckId required', 422)
        if (!['RESOLVED', 'DISMISSED', 'ACKNOWLEDGED'].includes(decision)) return err('Invalid decision', 422)
        return ok(
          await resolveBottleneck({
            bottleneckId,
            decision: decision as any,
            note: body?.note ? String(body.note).slice(0, 400) : undefined,
            userId: user.id,
            userRole: user.role,
          })
        )
      }

      // #7 Emergency broadcast — OFFICER/ADMIN ONLY
      case 'broadcast': {
        if (!OFFICER_ROLES.includes(user.role as any)) return err('Forbidden — officer authorization required', 403)
        const severity = String(body?.severity || 'HIGH').toUpperCase()
        if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) return err('Invalid severity', 422)

        const result = await createBroadcast(
          {
            title: String(body?.title || ''),
            body: String(body?.body || ''),
            severity: severity as any,
            latitude: Number(body?.latitude),
            longitude: Number(body?.longitude),
            radiusKm: Number(body?.radiusKm ?? 5),
            areaLabel: body?.areaLabel ?? null,
            safetyInstructions: body?.safetyInstructions ?? null,
            evacuationInfo: body?.evacuationInfo ?? null,
            safePlaceInfo: body?.safePlaceInfo ?? null,
            incidentId: body?.incidentId ?? null,
            expiresInHours: body?.expiresInHours ?? null,
          },
          { id: user.id, role: user.role }
        )
        return ok(result, 201)
      }

      default:
        return err('Unknown action', 422)
    }
  } catch (e) {
    return handleAuthError(e)
  }
}
