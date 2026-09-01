import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { rejectAssignment } from '@/lib/workflows/incident-workflow'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const { id } = await ctx.params
    const body = parseBody(await req.json())
    const reason = String(body.reason || 'Rejected')
    await rejectAssignment(id, user.id, reason)
    return ok({ ok: true, decision: 'REJECTED' })
  } catch (e) {
    return handleAuthError(e)
  }
}
