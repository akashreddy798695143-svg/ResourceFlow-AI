import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { advanceResponse, escalateIncident, triggerReevaluation } from '@/lib/workflows/incident-workflow'

// PATCH /api/incidents/[id]/response
// Body: { stage: 'ACK' | 'START' | 'ARRIVE' | 'RESOLVE' }
// Responder/officer/admin updates the response lifecycle.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['RESPONDER', 'DISASTER_OFFICER', 'ADMIN'])
    const { id } = await ctx.params
    const body = parseBody(await req.json())
    const stage = String(body.stage || '').toUpperCase()
    if (!['ACK', 'START', 'ARRIVE', 'RESOLVE'].includes(stage)) return err('Invalid stage', 422)

    const incident = await db.incident.findUnique({ where: { id } })
    if (!incident) return err('Incident not found', 404)

    await advanceResponse(id, stage as any, user.id)
    return ok({ ok: true, stage })
  } catch (e) {
    return handleAuthError(e)
  }
}

// POST /api/incidents/[id]/escalate  Body: { reason }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const { id } = await ctx.params
    const body = parseBody(await req.json())
    const reason = String(body.reason || 'Officer escalation')
    const level = Number(body.level || 2)
    await escalateIncident(id, reason, level)
    return ok({ ok: true, level })
  } catch (e) {
    return handleAuthError(e)
  }
}

// PUT /api/incidents/[id]/reassess  Body: { reason }  — trigger adaptive re-evaluation
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const { id } = await ctx.params
    const body = parseBody(await req.json())
    const reason = String(body.reason || 'Officer-triggered re-evaluation')
    await triggerReevaluation(id, reason)
    return ok({ ok: true })
  } catch (e) {
    return handleAuthError(e)
  }
}
