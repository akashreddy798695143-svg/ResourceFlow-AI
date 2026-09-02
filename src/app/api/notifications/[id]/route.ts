import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'

export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    await db.notification.update({ where: { id }, data: { read: true } })
    return ok({ ok: true })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    await db.notification.delete({ where: { id } })
    return ok({ ok: true })
  } catch (e) {
    return handleAuthError(e)
  }
}
