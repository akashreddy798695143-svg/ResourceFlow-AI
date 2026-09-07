// DELETE /api/citizen/safety-contacts/[id] — remove own contact
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['CITIZEN'])
    const { id } = await ctx.params
    const contact = await db.safetyContact.findUnique({ where: { id } })
    if (!contact || contact.ownerId !== user.id) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }
    await db.safetyContact.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleAuthError(e)
  }
}
