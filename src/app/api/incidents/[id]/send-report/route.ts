import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { sendResolutionEmails } from '@/lib/workflows/email-workflow'

// POST /api/incidents/[id]/send-report
// Manually trigger the resolution email(s). Authorised officers/admins only.
// This is the fallback path — the AUTOMATIC trigger is in resolveIncident().
// Idempotent — if incident.resolutionEmailSent is true, no duplicate send happens.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const { id } = await ctx.params
    const incident = await db.incident.findUnique({ where: { id } })
    if (!incident) return err('Incident not found', 404)
    if (incident.status !== 'RESOLVED') {
      return err('Incident must be resolved before sending a report email', 422)
    }
    if (incident.resolutionEmailSent) {
      return ok({ ok: true, alreadySent: true, message: 'Resolution email already sent — no duplicate send' })
    }
    // Trigger the send (async, non-blocking)
    await sendResolutionEmails(id, user.id)
    return ok({ ok: true, message: 'Resolution email workflow triggered' })
  } catch (e) {
    return handleAuthError(e)
  }
}
