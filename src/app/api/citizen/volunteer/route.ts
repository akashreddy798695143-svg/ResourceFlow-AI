// Community Volunteer Mode — verified safe citizens register for suitable assistance.
// GET: own registration. POST: register (CITIZEN only). PATCH: officer review.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { recordAudit } from '@/lib/events'
import { pushNotification } from '@/lib/notifications'
import type { VolunteerStatus } from '@prisma/client'

export async function GET() {
  try {
    const user = await requireAuth()
    // Citizens see only their own registration; officers see aggregate in citizen-intel
    if (user.role === 'CITIZEN') {
      const registration = await db.volunteerRegistration.findUnique({
        where: { userId: user.id },
        select: {
          id: true, skills: true, availability: true, areas: true, hasTransport: true,
          status: true, reviewNote: true, createdAt: true, verifiedSafe: true,
          latitude: true, longitude: true, locationTimestamp: true, locationSharing: true,
        },
      })
      return NextResponse.json({ registration })
    }
    // Officers: summary counts + pending list (no personal contact info)
    const [pending, total, active] = await Promise.all([
      db.volunteerRegistration.findMany({ where: { status: 'PENDING' }, take: 50, select: { id: true, userId: true, skills: true, availability: true, areas: true, hasTransport: true, status: true, User: { select: { name: true } } } }),
      db.volunteerRegistration.count(),
      db.volunteerRegistration.count({ where: { status: { in: ['APPROVED', 'ACTIVE'] } } }),
    ])
    return NextResponse.json({ pending, total, active })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN'])
    const existing = await db.volunteerRegistration.findUnique({ where: { userId: user.id } })
    if (existing && existing.status !== 'REJECTED' && existing.status !== 'INACTIVE') {
      return NextResponse.json({ error: 'You already have a volunteer registration' }, { status: 409 })
    }
    const body = await req.json().catch(() => ({}))
    const skills = String(body.skills || '').trim().slice(0, 300)
    const availability = String(body.availability || 'AVAILABLE').trim().slice(0, 120)
    if (!skills) {
      return NextResponse.json({ error: 'skills are required' }, { status: 422 })
    }
    // "Verified safe": user has a recent "I'm Safe" check-in (non-critical trust signal)
    const recentSafe = await db.safeCheckIn.findFirst({
      where: { userId: user.id, isSafe: true, createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
      select: { id: true },
    })

    // Optional location (only stored if explicitly provided + valid)
    const lat = Number(body.latitude)
    const lng = Number(body.longitude)
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

    const data = {
      skills,
      availability: availability || 'AVAILABLE',
      areas: typeof body.areas === 'string' ? body.areas.slice(0, 200) : null,
      hasTransport: !!body.hasTransport,
      verifiedSafe: !!recentSafe,
      status: 'PENDING' as const,
      locationSharing: hasLocation ? !!body.locationSharing : false,
      latitude: hasLocation ? lat : null,
      longitude: hasLocation ? lng : null,
      locationTimestamp: hasLocation ? new Date() : null,
    }
    const registration = existing
      ? await db.volunteerRegistration.update({ where: { userId: user.id }, data })
      : await db.volunteerRegistration.create({ data: { ...data, userId: user.id } })
    await recordAudit({ userId: user.id, role: user.role, action: 'VOLUNTEER_REGISTERED', entityId: registration.id })
    // Notify officers for review
    const officers = await db.user.findMany({ where: { role: { in: ['DISASTER_OFFICER', 'ADMIN'] }, active: true }, select: { id: true } })
    for (const o of officers.slice(0, 10)) {
      await pushNotification({ type: 'INFO', message: `New volunteer registration awaiting review (${user.name}).`, userId: o.id, entityId: registration.id })
    }
    return NextResponse.json({ registration }, { status: 201 })
  } catch (e) {
    return handleAuthError(e)
  }
}

// PATCH — two modes:
// 1. Officer review: { userId, decision: 'APPROVED'|'REJECTED'|'ACTIVE'|'INACTIVE', note? }
// 2. Volunteer self-update: { availability, locationSharing, skills, areas, hasTransport }
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const body = await req.json().catch(() => ({}))

    // Officer review mode
    if (body.userId && ['APPROVED', 'REJECTED', 'ACTIVE', 'INACTIVE'].includes(body.decision)) {
      const targetUserId = String(body.userId || '')
      const decision = String(body.decision || '')
      if (user.role === 'CITIZEN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const registration = await db.volunteerRegistration.update({
        where: { userId: targetUserId },
        data: { status: decision as VolunteerStatus, reviewedById: user.id, reviewNote: typeof body.note === 'string' ? body.note.slice(0, 300) : null },
      })
      await recordAudit({ userId: user.id, role: user.role, action: 'VOLUNTEER_REVIEWED', entityId: registration.id, newState: decision })
      await pushNotification({ type: 'INFO', message: `Your volunteer registration was ${decision.toLowerCase()}.`, userId: targetUserId, entityId: registration.id })
      return NextResponse.json({ registration })
    }

    // Volunteer self-update mode
    if (user.role === 'CITIZEN') {
      const registration = await db.volunteerRegistration.findUnique({ where: { userId: user.id } })
      if (!registration) {
        return NextResponse.json({ error: 'Volunteer registration not found' }, { status: 404 })
      }
      const data: any = {}
      if (typeof body.availability === 'string' && body.availability.trim()) {
        data.availability = body.availability.trim().slice(0, 120)
      }
      if (typeof body.skills === 'string' && body.skills.trim()) {
        data.skills = body.skills.trim().slice(0, 300)
      }
      if (typeof body.areas === 'string') {
        data.areas = body.areas.trim().slice(0, 200) || null
      }
      if (typeof body.hasTransport === 'boolean') {
        data.hasTransport = body.hasTransport
      }
      if (typeof body.locationSharing === 'boolean') {
        data.locationSharing = body.locationSharing
      }
      const updated = await db.volunteerRegistration.update({ where: { userId: user.id }, data })
      await recordAudit({ userId: user.id, role: user.role, action: 'VOLUNTEER_UPDATED', entityId: registration.id })
      return NextResponse.json({ registration: updated })
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 422 })
  } catch (e) {
    return handleAuthError(e)
  }
}
