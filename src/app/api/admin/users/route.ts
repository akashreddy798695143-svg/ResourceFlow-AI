import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, parseBody } from '@/lib/api'
import type { Role } from '@prisma/client'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth(['ADMIN'])
    // Admin sees full personal info (phone + email) for all users
    const users = await db.user.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, email: true, name: true, role: true, active: true, phone: true, phoneVerified: true, emailVerified: true, createdAt: true } })
    return ok({ users })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'])
    const body = parseBody(await req.json())
    const { id, role, active } = body
    const user = await db.user.findUnique({ where: { id } })
    if (!user) return ok({ error: 'User not found' }, 404)
    const data: any = {}
    if (role && ['CITIZEN', 'RESPONDER', 'DISASTER_OFFICER', 'ADMIN'].includes(role)) data.role = role as Role
    if (typeof active === 'boolean') data.active = active
    const updated = await db.user.update({ where: { id }, data })
    return ok({ user: { id: updated.id, email: updated.email, role: updated.role, active: updated.active } })
  } catch (e) {
    return handleAuthError(e)
  }
}
