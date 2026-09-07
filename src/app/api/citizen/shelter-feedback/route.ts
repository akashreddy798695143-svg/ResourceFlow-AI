// Shelter Feedback — crowdsourced shelter availability/crowding.
// GET: aggregated per-shelter status (all roles). POST: submit feedback (citizen).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { recordAudit } from '@/lib/events'
import type { ShelterStatus } from '@prisma/client'

const STATUSES: ShelterStatus[] = ['OPEN', 'CROWDED', 'FULL', 'CLOSED']

// GET returns latest feedback per shelter (aggregated) + recent raw entries
export async function GET() {
  try {
    await requireAuth()
    const recent = await db.shelterFeedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, shelterName: true, status: true, occupancyPct: true, waitMinutes: true, suppliesNote: true, createdAt: true },
    })
    // Aggregate: latest status per shelter
    const byShelter = new Map<string, typeof recent[number]>()
    for (const fb of recent) {
      if (!byShelter.has(fb.shelterName)) byShelter.set(fb.shelterName, fb)
    }
    return NextResponse.json({ shelters: [...byShelter.values()], recent: recent.slice(0, 30) })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN'])
    const body = await req.json().catch(() => ({}))
    const shelterName = String(body.shelterName || '').trim().slice(0, 200)
    if (!shelterName || !STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'shelterName and a valid status are required' }, { status: 422 })
    }
    const feedback = await db.shelterFeedback.create({
      data: {
        reportedById: user.id,
        shelterName,
        status: body.status as ShelterStatus,
        occupancyPct: Number.isFinite(Number(body.occupancyPct)) ? Math.max(0, Math.min(100, Number(body.occupancyPct))) : null,
        waitMinutes: Number.isFinite(Number(body.waitMinutes)) ? Math.max(0, Number(body.waitMinutes)) : null,
        suppliesNote: typeof body.suppliesNote === 'string' ? body.suppliesNote.slice(0, 500) : null,
      },
    })
    await recordAudit({ userId: user.id, role: user.role, action: 'SHELTER_FEEDBACK', entityId: feedback.id, newState: body.status })
    return NextResponse.json({ feedback }, { status: 201 })
  } catch (e) {
    return handleAuthError(e)
  }
}
