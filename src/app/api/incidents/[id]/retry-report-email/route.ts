import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { retryResolutionEmail } from '@/lib/workflows/email-workflow'

// POST /api/incidents/[id]/retry-report-email
// Body: { emailNotificationId: string }
// Retries a FAILED email notification. Authorised officers/admins only.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const { id } = await ctx.params
    const body = parseBody(await req.json())
    const { emailNotificationId } = body
    if (!emailNotificationId) return err('emailNotificationId is required', 422)

    const result = await retryResolutionEmail(id, String(emailNotificationId), user.id)
    if (!result.ok) return err(result.error || 'Retry failed', 422)
    return ok({ ok: true, message: 'Retry succeeded — email sent' })
  } catch (e) {
    return handleAuthError(e)
  }
}
