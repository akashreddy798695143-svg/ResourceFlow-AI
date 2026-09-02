import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'
import { getEmailServiceStatus } from '@/lib/services/email-service'

// GET /api/admin/email-config — admin only
// Returns whether SMTP is configured + the host/port/from (NO credentials ever).
export async function GET(_req: NextRequest) {
  try {
    await requireAuth(['ADMIN'])
    return ok(getEmailServiceStatus())
  } catch (e) {
    return handleAuthError(e)
  }
}
