// POST /api/volunteer/location — Volunteer updates their live location (only with explicit permission)
// PATCH /api/volunteer/location — Toggle location sharing on/off
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { recordAudit, broadcastEvent } from '@/lib/events'

// POST — submit a location update (volunteer only, must have locationSharing enabled)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN'])
    const registration = await db.volunteerRegistration.findUnique({ where: { userId: user.id } })
    if (!registration) {
      return NextResponse.json({ error: 'Volunteer registration required' }, { status: 403 })
    }
    if (!registration.locationSharing) {
      return NextResponse.json({ error: 'Location sharing is disabled. Enable it first.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const latitude = Number(body.latitude)
    const longitude = Number(body.longitude)
    const accuracy = body.accuracy != null ? Number(body.accuracy) : null

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return NextResponse.json({ error: 'Invalid latitude/longitude' }, { status: 422 })
    }

    const now = new Date()

    // Store location update in history
    await db.volunteerLocationUpdate.create({
      data: {
        volunteerId: registration.id,
        latitude,
        longitude,
        accuracy: accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
        timestamp: now,
      },
    })

    // Update the volunteer's current location
    await db.volunteerRegistration.update({
      where: { id: registration.id },
      data: { latitude, longitude, locationTimestamp: now },
    })

    // Fan out to the realtime hub so Admin Volunteer Management + Officer map
    // immediately show the volunteer's latest authorized location
    await broadcastEvent({
      type: 'LOCATION_UPDATE',
      label: `${user.name} location updated`,
      data: { volunteerId: registration.id, latitude, longitude, timestamp: now.toISOString() },
    })

    // Prune old location updates (keep last 50 per volunteer to avoid unbounded growth)
    const allUpdates = await db.volunteerLocationUpdate.findMany({
      where: { volunteerId: registration.id },
      orderBy: { timestamp: 'desc' },
      skip: 50,
      select: { id: true },
    })
    if (allUpdates.length > 0) {
      await db.volunteerLocationUpdate.deleteMany({
        where: { id: { in: allUpdates.map((u) => u.id) } },
      })
    }

    return NextResponse.json({
      success: true,
      latitude,
      longitude,
      timestamp: now.toISOString(),
      locationSharing: true,
    })
  } catch (e) {
    return handleAuthError(e)
  }
}

// PATCH — toggle location sharing on/off (volunteer only)
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN'])
    const registration = await db.volunteerRegistration.findUnique({ where: { userId: user.id } })
    if (!registration) {
      return NextResponse.json({ error: 'Volunteer registration required' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const locationSharing = !!body.locationSharing

    await db.volunteerRegistration.update({
      where: { id: registration.id },
      data: { locationSharing },
    })

    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'VOLUNTEER_LOCATION_SHARING',
      entityId: registration.id,
      newState: locationSharing ? 'ON' : 'OFF',
    })

    return NextResponse.json({ success: true, locationSharing })
  } catch (e) {
    return handleAuthError(e)
  }
}

// GET — volunteer gets their own location status
export async function GET() {
  try {
    const user = await requireAuth(['CITIZEN'])
    const registration = await db.volunteerRegistration.findUnique({
      where: { userId: user.id },
      select: {
        latitude: true,
        longitude: true,
        locationTimestamp: true,
        locationSharing: true,
        availability: true,
        status: true,
      },
    })
    if (!registration) {
      return NextResponse.json({ error: 'Not registered as volunteer' }, { status: 404 })
    }
    return NextResponse.json({
      latitude: registration.latitude,
      longitude: registration.longitude,
      locationTimestamp: registration.locationTimestamp,
      locationSharing: registration.locationSharing,
      availability: registration.availability,
      status: registration.status,
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
