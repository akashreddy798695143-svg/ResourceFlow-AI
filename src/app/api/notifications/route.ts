import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'

// GET /api/notifications — unread first
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const onlyUnread = searchParams.get('unread') === '1'
    const where: any = {}
    if (onlyUnread) where.read = false
    // Officer/admin see all; others see targeted + untargeted
    if (user.role === 'CITIZEN' || user.role === 'RESPONDER') {
      where.OR = [{ userId: user.id }, { userId: null }]
    }
    const notifications = await db.notification.findMany({
      where,
      orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
      take: 80,
    })
    return ok({ notifications })
  } catch (e) {
    return handleAuthError(e)
  }
}
