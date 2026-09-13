// POST /api/features/offline-sync — sync a single offline-queued emergency report.
// Uses an idempotency key (the client-generated UUID) to prevent duplicate submissions.
// This endpoint duplicates the validateable fields of /api/incidents but is
// dedicated to the offline-queue flow. It does NOT redefine the Incident model.
//
// Behavior:
//   - Body must contain `idempotencyKey` (uuid from the device queue).
//   - If an Incident already exists with `imageMeta` carrying the same idempotencyKey,
//     we return it WITHOUT creating a new incident.
//   - Otherwise we create the incident and stamp the idempotencyKey into imageMeta so
//     subsequent syncs cannot duplicate.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { reverseGeocode } from '@/lib/services/geocode-service'
import type { IncidentType } from '@prisma/client'

const ALLOWED: IncidentType[] = [
  'FLOOD', 'CYCLONE', 'EARTHQUAKE', 'LANDSLIDE', 'ROAD_BLOCKAGE',
  'FIRE', 'MEDICAL', 'INFRASTRUCTURE', 'BUILDING_COLLAPSE',
  'FOREST_FIRE', 'HEAVY_RAINFALL', 'INDUSTRIAL_ACCIDENT', 'OTHER',
]

const IDEMPOTENCY_PREFIX = 'queued:'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const body = parseBody(await req.json())

    const idempotencyKey = String(body?.idempotencyKey || '').trim()
    if (!idempotencyKey) return err('idempotencyKey required', 422)

    const incidentType = String(body?.incidentType || '')
    const description = String(body?.description || '').trim()
    const latitude = Number(body?.latitude)
    const longitude = Number(body?.longitude)
    const language = body?.language != null ? String(body.language).slice(0, 5).toLowerCase() : null
    const inputMethod = ['text', 'voice'].includes(body?.inputMethod) ? body?.inputMethod : 'text'
    const imageMeta = body?.imageMeta && typeof body.imageMeta === 'object' ? body.imageMeta : null

    if (!ALLOWED.includes(incidentType as IncidentType)) return err('Invalid incidentType', 422)
    if (description.length < 5) return err('description too short', 422)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return err('latitude/longitude invalid', 422)
    }

    // ─── Duplicate guard ────────────────────────────────────────────────────
    const idempToken = `${IDEMPOTENCY_PREFIX}${idempotencyKey}`
    const existing = await db.incident.findFirst({
      where: { reportedById: user.id, imageMeta: { contains: idempToken } },
      select: { id: true, incidentCode: true, status: true, createdAt: true },
    })
    if (existing) {
      return ok({
        duplicate: true,
        incident: {
          id: existing.id,
          incidentCode: existing.incidentCode,
          status: existing.status,
          createdAt: existing.createdAt.toISOString(),
        },
        message: 'Queued report already synced — no duplicate created.',
      })
    }

    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true, phone: true },
    })
    if (!dbUser) return err('Authenticated user not found', 401)

    // Location name
    let locationName = typeof body?.location === 'string' && body.location.trim() ? body.location.trim() : ''
    if (!locationName) {
      const geocoded = await reverseGeocode(latitude, longitude)
      locationName = geocoded?.shortName || 'Location name unavailable'
    }

    const imageMetaJson = imageMeta
      ? JSON.stringify({
        filename: String(imageMeta.filename || 'upload'),
        size: Number(imageMeta.size || 0),
        contentType: String(imageMeta.contentType || ''),
        idempotencyKey: idempToken,
      })
      : JSON.stringify({ idempotencyKey: idempToken })

    const year = new Date().getFullYear()
    const count = await db.incident.count()
    const incidentCode = `RF-${year}-${String(count + 1).padStart(6, '0')}`

    const newIncident = await db.incident.create({
      data: {
        incidentCode,
        type: incidentType as IncidentType,
        description,
        citizenName: dbUser.name,
        citizenPhone: dbUser.phone || null,
        citizenEmail: dbUser.email,
        originalDescription: description,
        transcription: inputMethod === 'voice' ? description : null,
        language,
        inputMethod,
        location: locationName,
        latitude,
        longitude,
        locationAccuracy: body?.locationAccuracy != null ? Number(body.locationAccuracy) : null,
        locationTimestamp: body?.locationTimestamp ? new Date(body.locationTimestamp) : null,
        imageMeta: imageMetaJson,
        status: 'NEW',
        reportedById: user.id,
      },
    })

    // Reuse the same call to run the workflow that /api/incidents does, but fire-and-forget.
    import('@/lib/workflows/incident-workflow').then(({ runIncidentWorkflow }) => {
      runIncidentWorkflow(newIncident.id).catch(() => { })
    }).catch(() => { })

    return ok(
      {
        duplicate: false,
        incident: {
          id: newIncident.id,
          incidentCode: newIncident.incidentCode,
          status: newIncident.status,
          createdAt: newIncident.createdAt.toISOString(),
        },
        message: 'Queued report synced to the server.',
      },
      201,
    )
  } catch (e) {
    return handleAuthError(e)
  }
}
