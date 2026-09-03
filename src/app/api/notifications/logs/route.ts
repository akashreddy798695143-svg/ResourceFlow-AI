import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { maskEmail, maskPhone } from '@/lib/services/email-service'
import { maskPhone as smsMaskPhone } from '@/lib/services/sms-service'

// GET /api/notifications/logs
// Admin sees all logs. Officer sees logs for incidents + their own.
// Citizen sees only their own logs (and recipients are their own address, unmasked).
// Responder sees only their own logs.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const incidentId = searchParams.get('incidentId')
    const notificationType = searchParams.get('notificationType')
    const channel = searchParams.get('channel')
    const limit = Math.min(200, Number(searchParams.get('limit') || 100))

    const where: any = {}
    if (incidentId) where.incidentId = incidentId
    if (notificationType) where.notificationType = notificationType
    if (channel) where.channel = channel

    if (user.role === 'ADMIN') {
      // admin: all logs
    } else if (user.role === 'DISASTER_OFFICER') {
      // officer: incident logs + their own
      where.OR = [{ userId: user.id }, { incidentId: { not: null } }]
    } else {
      // citizen + responder: only their own logs
      where.userId = user.id
    }

    const logs = await db.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { name: true, role: true } } },
    })

    // Mask recipients — citizens/responders see their own address unmasked; admins see full; officers see masked
    const isAdmin = user.role === 'ADMIN'
    const isSelf = (log: any) => log.userId === user.id
    const masked = logs.map((log) => ({
      ...log,
      recipient: isAdmin || isSelf(log) ? log.recipient : maskRecipient(log.recipient, log.channel),
    }))

    return ok({ logs: masked })
  } catch (e) {
    return handleAuthError(e)
  }
}

function maskRecipient(recipient: string, channel: string): string {
  if (channel === 'EMAIL') return maskEmail(recipient)
  if (channel === 'SMS') return smsMaskPhone(recipient)
  return recipient  // IN_APP is "in-app:{userId}" — not sensitive
}
