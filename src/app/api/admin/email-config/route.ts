import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'
import { getEmailServiceStatus } from '@/lib/services/email-service'
import { getSmsServiceStatus } from '@/lib/services/sms-service'

// GET /api/admin/email-config — admin only
// Returns whether SMTP + SMS are configured + host/port/from/provider (NO credentials ever).
export async function GET(_req: NextRequest) {
  try {
    await requireAuth(['ADMIN'])
    return ok({
      email: getEmailServiceStatus(),
      sms: getSmsServiceStatus(),
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
