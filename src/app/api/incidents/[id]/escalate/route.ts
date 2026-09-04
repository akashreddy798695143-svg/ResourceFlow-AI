import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, parseBody } from '@/lib/api'
import { escalateIncident } from '@/lib/workflows/incident-workflow'

// POST /api/incidents/[id]/escalate  Body: { reason, level }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
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