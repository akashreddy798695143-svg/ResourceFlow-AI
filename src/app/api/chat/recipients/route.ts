import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'
import { CHAT_ALLOWED_TARGETS } from '@/lib/chat'
import type { Role } from '@prisma/client'

// GET /api/chat/recipients — users the current user is permitted to message (role matrix, active, excluding self).
export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth()
    const targets = CHAT_ALLOWED_TARGETS[user.role as Role] || []
    const recipients = await db.user.findMany({
      where: { id: { not: user.id }, active: true, role: { in: targets as Role[] } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    })
    return ok({ recipients })
  } catch (e) {
    return handleAuthError(e)
  }
}