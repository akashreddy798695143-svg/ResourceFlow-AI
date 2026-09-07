// Officer Citizen Intelligence — turns citizen reports into actionable data.
// GET: prioritized hazards + relief requests + volunteer/safety stats (OFFICER/ADMIN).
// POST: actions — verify/dismiss hazard, acknowledge/fulfill relief request.
// Privacy: citizen identities are reduced to first name + masked phone.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { recordAudit, broadcastEvent } from '@/lib/events'
import { scoreReportPriority } from '@/lib/services/citizen-safety-service'
import type { ReliefRequestStatus, VolunteerStatus } from '@prisma/client'

function maskName(name: string | null | undefined) {
  if (!name) return 'Citizen'
  return name.split(' ')[0] + ' ' + (name.split(' ')[1]?.[0] ? name.split(' ')[1][0] + '.' : '')
}
function maskPhone(phone: string | null | undefined) {
  if (!phone) return null
  return phone.slice(0, 3) + '***' + phone.slice(-2)
}

export async function GET() {
  try {
    await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const since = new Date(Date.now() - 72 * 3600 * 1000)
    const [hazards, relief, volunteers, safeCheckIns, sosCount] = await Promise.all([
      db.hazardReport.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { reportedBy: { select: { name: true, phone: true } } },
      }),
      db.reliefRequest.findMany({
        where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { requestedBy: { select: { name: true, phone: true } } },
      }),
      db.volunteerRegistration.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { user: { select: { name: true, email: true } } },
      }),
      db.safeCheckIn.findMany({ where: { createdAt: { gte: since }, isSafe: true }, select: { id: true } }),
      db.incident.count({ where: { inputMethod: 'sos_one_tap', createdAt: { gte: since } } }),
    ])

    // 9. AI report prioritization — score every open citizen report
    const scoredHazards = hazards
      .filter((h) => h.status !== 'RESOLVED')
      .map((h) => ({
        id: h.id,
        hazardType: h.hazardType,
        description: h.description,
        aiSummary: h.aiSummary,
        location: h.location,
        latitude: h.latitude,
        longitude: h.longitude,
        severity: h.severity,
        status: h.status,
        aiConfidence: h.aiConfidence,
        confirmCount: h.confirmCount,
        verified: h.verified,
        duplicateOfId: h.duplicateOfId,
        reportedBy: { name: maskName(h.reportedBy?.name), phone: maskPhone(h.reportedBy?.phone) },
        priorityScore: scoreReportPriority({ severity: h.severity, confirmCount: h.confirmCount, aiConfidence: h.aiConfidence, createdAt: h.createdAt, status: h.status }),
        createdAt: h.createdAt,
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore)

    const scoredRelief = relief
      .map((r) => ({
        id: r.id,
        needType: r.needType,
        quantity: r.quantity,
        urgency: r.urgency,
        notes: r.notes,
        location: r.location,
        latitude: r.latitude,
        longitude: r.longitude,
        status: r.status,
        requestedBy: { name: maskName(r.requestedBy?.name), phone: maskPhone(r.requestedBy?.phone) },
        priorityScore: scoreReportPriority({ severity: r.urgency, createdAt: r.createdAt, status: r.status }),
        createdAt: r.createdAt,
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore)

    return NextResponse.json({
      hazards: scoredHazards.filter((h) => !h.duplicateOfId || h.priorityScore > 30),
      reliefRequests: scoredRelief,
      stats: {
        hazards72h: hazards.length,
        verifiedHazards: hazards.filter((h) => h.verified).length,
        openRelief: relief.filter((r) => r.status === 'OPEN').length,
        safeCheckIns72h: safeCheckIns.length,
        sos72h: sosCount,
        volunteersPending: volunteers.filter((v) => v.status === 'PENDING').length,
        volunteersActive: volunteers.filter((v) => ['APPROVED', 'ACTIVE'].includes(v.status)).length,
      },
      volunteers: volunteers.map((v) => ({
        id: v.id,
        userId: v.userId,
        name: maskName(v.user?.name),
        skills: v.skills,
        availability: v.availability,
        areas: v.areas,
        hasTransport: v.hasTransport,
        verifiedSafe: v.verifiedSafe,
        status: v.status,
      })),
    })
  } catch (e) {
    return handleAuthError(e)
  }
}



export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    if (action === 'verify_hazard' || action === 'dismiss_hazard' || action === 'resolve_hazard') {
      const id = String(body.id || '')
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 422 })
      const status = action === 'verify_hazard' ? 'CONFIRMED' : action === 'dismiss_hazard' ? 'DISMISSED' : 'RESOLVED'
      const hazard = await db.hazardReport.update({
        where: { id },
        data: {
          status,
          verified: action === 'verify_hazard',
          verifiedById: action === 'verify_hazard' ? user.id : null,
          verifiedAt: action === 'verify_hazard' ? new Date() : null,
        },
      })
      await recordAudit({ userId: user.id, role: user.role, action: `HAZARD_${status}`, entityId: id })
      await broadcastEvent({ type: 'HAZARD_UPDATED', label: `Hazard ${hazard.hazardType} -> ${status}`, data: { id, status } })
      return NextResponse.json({ hazard })
    }

    if (action === 'update_relief') {
      const id = String(body.id || '')
      const status = String(body.status || '')
      if (!id || !['OPEN', 'ACKNOWLEDGED', 'FULFILLED', 'CANCELLED'].includes(status)) {
        return NextResponse.json({ error: 'id and a valid status are required' }, { status: 422 })
      }
      const relief = await db.reliefRequest.update({ where: { id }, data: { status: status as ReliefRequestStatus } })
      await recordAudit({ userId: user.id, role: user.role, action: 'RELIEF_UPDATED', entityId: id, newState: status })
      await broadcastEvent({ type: 'RELIEF_UPDATED', label: `Relief ${relief.needType} -> ${status}`, data: { id, status } })
      return NextResponse.json({ relief })
    }

    if (action === 'review_volunteer') {
      const userId = String(body.userId || '')
      const decision = String(body.decision || '')
      if (!userId || !['APPROVED', 'REJECTED', 'ACTIVE', 'INACTIVE'].includes(decision)) {
        return NextResponse.json({ error: 'userId and a valid decision are required' }, { status: 422 })
      }
      const registration = await db.volunteerRegistration.update({
        where: { userId },
        data: { status: decision as VolunteerStatus, reviewedById: user.id, reviewNote: typeof body.note === 'string' ? body.note.slice(0, 300) : null },
      })
      await recordAudit({ userId: user.id, role: user.role, action: 'VOLUNTEER_REVIEWED', entityId: registration.id, newState: decision })
      return NextResponse.json({ registration })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 422 })
  } catch (e) {
    return handleAuthError(e)
  }
}
