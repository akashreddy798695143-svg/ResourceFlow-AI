// GET /api/features/missing-info?incidentId=...
// Returns the missing-information follow-up questions for the incident.
// POST /api/features/missing-info — append citizen answers to the SAME incident
//   (NO duplicate incident is created). Backed by the Incident model.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import {
  detectMissingInformationForIncidentId,
  summarizeForCitizen,
} from '@/lib/features/missing-info-detector'
import { recordIncidentEvent, recordAudit } from '@/lib/events'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN', 'RESPONDER'])
    const { searchParams } = new URL(req.url)
    const incidentId = searchParams.get('incidentId')
    if (!incidentId) return err('incidentId required', 422)

    // RBAC scoping
    const incident = await db.incident.findUnique({
      where: { id: incidentId },
      select: { reportedById: true },
    })
    if (!incident) return err('Incident not found', 404)
    if (user.role === 'CITIZEN' && incident.reportedById !== user.id) {
      return err('Forbidden', 403)
    }

    const result = await detectMissingInformationForIncidentId(incidentId)
    return ok({ ...result, summary: summarizeForCitizen(result) })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN', 'RESPONDER'])
    const body = parseBody(await req.json())
    const incidentId = String(body?.incidentId || '')
    if (!incidentId) return err('incidentId required', 422)
    const answers: Record<string, string> = (body?.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<string, string>

    const incident = await db.incident.findUnique({ where: { id: incidentId } })
    if (!incident) return err('Incident not found', 404)
    if (user.role === 'CITIZEN' && incident.reportedById !== user.id) {
      return err('Forbidden', 403)
    }

    // Merge answers into the existing description (do NOT create a new incident)
    const mergedLines: string[] = []
    for (const [key, value] of Object.entries(answers)) {
      if (!value) continue
      mergedLines.push(`[${key}] ${value}`)
    }
    const appendBlock = mergedLines.length ? `\n\nFollow-up details:\n${mergedLines.join('\n')}` : ''
    const newDescription = `${incident.description || ''}${appendBlock}`

    const updated = await db.incident.update({
      where: { id: incidentId },
      data: {
        description: newDescription,
      },
    })

    await recordIncidentEvent(incidentId, 'MISSING_INFO_UPDATED', {
      label: `Citizen follow-up: ${mergedLines.length} field(s) answered`,
      fields: Object.keys(answers),
    })
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'MISSING_INFO_UPDATED',
      entityId: incidentId,
      newState: `fields=${Object.keys(answers).join(',')}`,
    })

    // Re-evaluate missing-info state to show the user what is now captured.
    const recheck = await detectMissingInformationForIncidentId(incidentId)
    return ok({
      incident: { id: updated.id, incidentCode: updated.incidentCode, description: updated.description },
      recheck: { ...recheck, summary: summarizeForCitizen(recheck) },
      appliedFields: Object.keys(answers),
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
