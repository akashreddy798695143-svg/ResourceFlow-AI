import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'

// GET /api/notifications/preferences — current user's channel preferences
export async function GET() {
  try {
    const user = await requireAuth()
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { smsNotifications: true, emailNotifications: true, inAppNotifications: true, phone: true, email: true, phoneVerified: true, emailVerified: true },
    })
    if (!dbUser) return err('User not found', 404)
    return ok({
      smsNotifications: dbUser.smsNotifications,
      emailNotifications: dbUser.emailNotifications,
      inAppNotifications: dbUser.inAppNotifications,
      hasPhone: !!dbUser.phone,
      phoneVerified: dbUser.phoneVerified,
      emailVerified: dbUser.emailVerified,
      // Critical/emergency notifications cannot be disabled — surfaced to the UI
      criticalNonDisablable: true,
    })
  } catch (e) {
    return handleAuthError(e)
  }
}

// PATCH /api/notifications/preferences — update channel preferences
// Critical/emergency notifications (ESCALATION, APPROVAL_REQUIRED, etc.) are NOT
// suppressible — the notification service enforces this regardless of these prefs.
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = parseBody(await req.json())
    const data: any = {}
    if (typeof body.smsNotifications === 'boolean') data.smsNotifications = body.smsNotifications
    if (typeof body.emailNotifications === 'boolean') data.emailNotifications = body.emailNotifications
    if (typeof body.inAppNotifications === 'boolean') data.inAppNotifications = body.inAppNotifications
    if (Object.keys(data).length === 0) return err('No preference fields to update', 422)

    const updated = await db.user.update({
      where: { id: user.id },
      data,
      select: { smsNotifications: true, emailNotifications: true, inAppNotifications: true },
    })
    return ok({ ...updated, criticalNonDisablable: true })
  } catch (e) {
    return handleAuthError(e)
  }
}
