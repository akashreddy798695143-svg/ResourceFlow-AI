// Relief Need Requests — citizens request food/water/medical/essentials.
// GET: own requests. POST: create request (visible to officers via citizen-intel).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { recordAudit, broadcastEvent } from '@/lib/events'
import type { ReliefNeedType, Severity } from '@prisma/client'

const NEED_TYPES: ReliefNeedType[] = ['FOOD','WATER','MEDICAL','SHELTER','CLOTHING','RESCUE','POWER','OTHER']

export async function GET() {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const requests = await db.reliefRequest.findMany({
      where: { requestedById: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ requests })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN'])
    const body = await req.json().catch(() => ({}))
    const needType = NEED_TYPES.includes(body.needType) ? (body.needType as ReliefNeedType) : null
    const location = String(body.location || '').trim().slice(0, 300)
    if (!needType || !location) {
      return NextResponse.json({ error: 'needType and location are required' }, { status: 422 })
    }
    const request = await db.reliefRequest.create({
      data: {
        requestedById: user.id,
        needType,
        quantity: typeof body.quantity === 'string' ? body.quantity.slice(0, 120) : null,
        urgency: (['LOW','MEDIUM','HIGH','CRITICAL'].includes(body.urgency) ? body.urgency : 'MEDIUM') as Severity,
        notes: typeof body.notes === 'string' ? body.notes.slice(0, 800) : null,
        location,
        latitude: Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : null,
        longitude: Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : null,
      },
    })
    await recordAudit({ userId: user.id, role: user.role, action: 'RELIEF_REQUESTED', entityId: request.id, newState: needType })
    await broadcastEvent({
      type: 'RELIEF_REQUESTED',
      label: `Relief request: ${needType} at ${location} (${request.urgency})`,
      data: { id: request.id, needType, urgency: request.urgency },
    })
    return NextResponse.json({ request }, { status: 201 })
  } catch (e) {
    return handleAuthError(e)
  }
}
