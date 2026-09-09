// GET /api/admin/volunteers — Admin/Officer view of all volunteers with location + contact
// POST /api/admin/volunteers — Assign/recommend a volunteer for an incident
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { recordAudit, broadcastEvent } from '@/lib/events'
import type { VolunteerStatus } from '@prisma/client'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const { searchParams } = new URL(req.url)
    const statusFilter = searchParams.get('status')
    const availabilityFilter = searchParams.get('availability')

    let where: any = {}
    if (statusFilter && statusFilter !== 'ALL') {
      where.status = statusFilter as VolunteerStatus
    }
    if (availabilityFilter && availabilityFilter !== 'ALL') {
      where.availability = availabilityFilter
    }

    const volunteers = await db.volunteerRegistration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        User: { select: { name: true, email: true, phone: true } },
        assignments: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { incident: { select: { incidentCode: true, type: true, status: true } } },
        },
      },
    })

    const result = volunteers.map((v) => ({
      id: v.id,
      userId: v.userId,
      name: v.User.name,
      email: v.User.email,
      phone: v.User.phone,
      skills: v.skills,
      availability: v.availability,
      areas: v.areas,
      hasTransport: v.hasTransport,
      status: v.status,
      verifiedSafe: v.verifiedSafe,
      reviewNote: v.reviewNote,
      latitude: v.latitude,
      longitude: v.longitude,
      locationTimestamp: v.locationTimestamp,
      locationSharing: v.locationSharing,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      assignments: v.assignments.map((a) => ({
        id: a.id,
        incidentId: a.incidentId,
        incidentCode: a.incident.incidentCode,
        incidentType: a.incident.type,
        incidentStatus: a.incident.status,
        status: a.status,
        createdAt: a.createdAt,
      })),
    }))

    return NextResponse.json({ volunteers: result })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const body = await req.json().catch(() => ({}))
    const volunteerId = String(body.volunteerId || '')
    const incidentId = String(body.incidentId || '')
    const action = String(body.action || 'recommend')

    if (!volunteerId || !incidentId) {
      return NextResponse.json({ error: 'volunteerId and incidentId are required' }, { status: 422 })
    }

    const volunteer = await db.volunteerRegistration.findUnique({
      where: { id: volunteerId },
      include: { User: { select: { id: true, name: true } } },
    })
    if (!volunteer) {
      return NextResponse.json({ error: 'Volunteer not found' }, { status: 404 })
    }

    const incident = await db.incident.findUnique({ where: { id: incidentId } })
    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    if (action === 'recommend') {
      const existing = await db.volunteerAssignment.findFirst({
        where: { volunteerId, incidentId, status: 'RECOMMENDED' },
      })
      if (existing) {
        return NextResponse.json({ error: 'Volunteer already recommended for this incident' }, { status: 409 })
      }
      const assignment = await db.volunteerAssignment.create({
        data: {
          volunteerId,
          incidentId,
          status: 'RECOMMENDED',
          recommendedBy: user.id,
          note: typeof body.note === 'string' ? body.note.slice(0, 300) : null,
        },
      })
      await recordAudit({
        userId: user.id, role: user.role, action: 'VOLUNTEER_RECOMMENDED',
        entityId: assignment.id, reason: `Recommended ${volunteer.User.name} for ${incident.incidentCode}`,
      })
      await broadcastEvent({
        type: 'VOLUNTEER_RECOMMENDED',
        label: `${volunteer.User.name} recommended for ${incident.incidentCode}`,
        incidentId,
      })
      return NextResponse.json({ assignment }, { status: 201 })
    }

    if (action === 'approve') {
      const assignment = await db.volunteerAssignment.create({
        data: {
          volunteerId,
          incidentId,
          status: 'APPROVED',
          recommendedBy: user.id,
          approvedById: user.id,
          approvedAt: new Date(),
          note: typeof body.note === 'string' ? body.note.slice(0, 300) : null,
        },
      })
      await recordAudit({
        userId: user.id, role: user.role, action: 'VOLUNTEER_ASSIGNED',
        entityId: assignment.id, reason: `Assigned ${volunteer.User.name} to ${incident.incidentCode}`,
      })
      await broadcastEvent({
        type: 'VOLUNTEER_ASSIGNED',
        label: `${volunteer.User.name} assigned to ${incident.incidentCode}`,
        incidentId,
      })
      return NextResponse.json({ assignment }, { status: 201 })
    }

    if (action === 'reject') {
      const assignmentId = String(body.assignmentId || '')
      if (!assignmentId) {
        return NextResponse.json({ error: 'assignmentId required to reject' }, { status: 422 })
      }
      const assignment = await db.volunteerAssignment.update({
        where: { id: assignmentId },
        data: { status: 'REJECTED', approvedById: user.id, approvedAt: new Date() },
      })
      await recordAudit({
        userId: user.id, role: user.role, action: 'VOLUNTEER_REJECTED',
        entityId: assignment.id, reason: `Rejected assignment for ${volunteer.User.name}`,
      })
      return NextResponse.json({ assignment })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 422 })
  } catch (e) {
    return handleAuthError(e)
  }
}
