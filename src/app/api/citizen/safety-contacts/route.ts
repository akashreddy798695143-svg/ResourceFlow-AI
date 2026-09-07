// Family Safety Circle — trusted contacts CRUD (owner-scoped).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { recordAudit } from '@/lib/events'

// GET /api/citizen/safety-contacts — list own contacts (CITIZEN only)
export async function GET() {
  try {
    const user = await requireAuth(['CITIZEN'])
    const contacts = await db.safetyContact.findMany({
      where: { ownerId: user.id },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ contacts })
  } catch (e) {
    return handleAuthError(e)
  }
}

// POST /api/citizen/safety-contacts — add a trusted contact
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN'])
    const body = await req.json().catch(() => ({}))
    const name = String(body.name || '').trim().slice(0, 120)
    const phone = String(body.phone || '').replace(/[^\d+]/g, '').slice(0, 20)
    if (!name || phone.length < 6) {
      return NextResponse.json({ error: 'Name and a valid phone are required' }, { status: 422 })
    }
    const existing = await db.safetyContact.count({ where: { ownerId: user.id } })
    const contact = await db.safetyContact.create({
      data: {
        ownerId: user.id,
        name,
        phone,
        relation: ['FAMILY', 'FRIEND', 'NEIGHBOUR', 'OTHER'].includes(body.relation) ? body.relation : 'FAMILY',
        isPrimary: existing === 0,
      },
    })
    await recordAudit({ userId: user.id, role: user.role, action: 'SAFETY_CONTACT_ADDED', entityId: contact.id })
    return NextResponse.json({ contact }, { status: 201 })
  } catch (e) {
    return handleAuthError(e)
  }
}
