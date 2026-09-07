// Safe Check-In — mark "I'm Safe" and share status with trusted contacts.
// Contacts that are registered ResourceFlow users get an in-app notification;
// all shared contacts are recorded in the check-in payload for the offline card.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { pushNotification } from '@/lib/notifications'
import { recordAudit } from '@/lib/events'

// GET /api/citizen/check-in — latest own check-ins
export async function GET() {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const checkIns = await db.safeCheckIn.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    return NextResponse.json({ checkIns })
  } catch (e) {
    return handleAuthError(e)
  }
}

// POST /api/citizen/check-in — create a check-in and notify contacts
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const body = await req.json().catch(() => ({}))
    const contactIds: string[] = Array.isArray(body.contactIds) ? body.contactIds.map(String) : []
    const message = typeof body.message === 'string' ? body.message.slice(0, 300) : null

    // Validate ownership of every shared contact (privacy: never leak other users' contacts)
    let sharedContacts: { id: string; name: string; phone: string }[] = []
    if (contactIds.length) {
      const owned = await db.safetyContact.findMany({
        where: { ownerId: user.id, id: { in: contactIds } },
        select: { id: true, name: true, phone: true },
      })
      sharedContacts = owned
    }

    const checkIn = await db.safeCheckIn.create({
      data: {
        userId: user.id,
        isSafe: body.isSafe !== false,
        message,
        latitude: Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : null,
        longitude: Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : null,
        locationName: typeof body.locationName === 'string' ? body.locationName.slice(0, 300) : null,
        sharedWith: JSON.stringify(sharedContacts),
      },
    })

    // Notify contacts who are ResourceFlow users (phone/email match), without exposing requester details
    const notified: string[] = []
    for (const c of sharedContacts) {
      const digits = c.phone.replace(/\D/g, '').slice(-10)
      const contactUser = await db.user.findFirst({
        where: { OR: [{ phone: { endsWith: digits } }, { phone: c.phone }] },
        select: { id: true, name: true },
      })
      if (contactUser) {
        await pushNotification({
          type: 'INFO',
          message: `${user.name} marked "I'm Safe" at ${new Date().toLocaleString()}${message ? ` — "${message}"` : ''}`,
          userId: contactUser.id,
          entityId: checkIn.id,
        })
        notified.push(contactUser.id)
      }
    }

    await recordAudit({ userId: user.id, role: user.role, action: 'SAFE_CHECK_IN', entityId: checkIn.id, newState: 'SAFE' })
    return NextResponse.json(
      {
        checkIn,
        sharedWith: sharedContacts.map((c) => ({ id: c.id, name: c.name })), // never return phone back to client
        notifiedAppUsers: notified.length,
        message: `Safe status recorded and shared with ${sharedContacts.length} trusted contact(s).`,
      },
      { status: 201 }
    )
  } catch (e) {
    return handleAuthError(e)
  }
}
