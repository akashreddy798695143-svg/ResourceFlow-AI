// Emergency communication chat — lightweight unread count for the nav badge.
import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'
import { countUnreadForUser } from '@/lib/chat'

// GET /api/chat/unread — total unread messages for the current user
export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth()
    const unreadCount = await countUnreadForUser(user.id)
    return ok({ unreadCount })
  } catch (e) {
    return handleAuthError(e)
  }
}
