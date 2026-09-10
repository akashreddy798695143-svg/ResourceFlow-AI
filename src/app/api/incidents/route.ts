// /api/incidents — citizen (or officer/admin) reports a new incident
// Extended with citizen location tracking, movement status, destination,
// impact zones, cascade risk, AI resource recommendations, and arrival flags.

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import {
  recordIncidentEvent,
  recordAudit,
  broadcastEvent,
} from '@/lib/events'
import { runIncidentWorkflow } from '@/lib/workflows/incident-workflow'
import { reverseGeocode } from '@/lib/services/geocode-service'
import type { IncidentType } from '@prisma/client'

const ALLOWED: IncidentType[] = [
  'FLOOD',
  'CYCLONE',
  'EARTHQUAKE',
  'LANDSLIDE',
  'ROAD_BLOCKAGE',
  'FIRE',
  'MEDICAL',
  'INFRASTRUCTURE',
  'BUILDING_COLLAPSE',
  'FOREST_FIRE',
  'HEAVY_RAINFALL',
  'INDUSTRIAL_ACCIDENT',
  'OTHER',
]

// POST /api/incidents
// Citizen / Officer / Admin can create an incident.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth([
      'CITIZEN',
      'DISASTER_OFFICER',
      'ADMIN',
    ])

    // Re-fetch authenticated user so phone/email are taken from DB,
    // never trusted from frontend.
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        email: true,
        phone: true,
      },
    })

    if (!dbUser) {
      return err('Authenticated user not found', 401)
    }

    const body = parseBody(await req.json())

    const {
      incidentType,
      description,
      location,
      latitude,
      longitude,
      imageMeta,
      language,
      inputMethod,
      locationAccuracy,
      locationTimestamp,

      // Citizen location tracking
      citizenMovementStatus,
      citizenDestinationName,
      citizenDestinationLatitude,
      citizenDestinationLongitude,

      // Resource destination
      resourceDestinationName,
      resourceDestinationLatitude,
      resourceDestinationLongitude,
      resourceDestinationType,

      // Impact zones
      impactZone1Km,
      impactZone5Km,
      impactZone10Km,

      // Cascade risk
      cascadeRisk,

      // AI recommendations
      aiRecommendedResources,
      resourceRequirementEstimate,
    } = body

    // Validate incident type
    if (!ALLOWED.includes(incidentType)) {
      return err('Invalid incidentType', 422)
    }

    // Validate description
    if (
      !description ||
      typeof description !== 'string' ||
      description.trim().length < 5
    ) {
      return err('description must be at least 5 characters', 422)
    }

    // Validate GPS
    const lat = Number(latitude)
    const lng = Number(longitude)

    if (
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return err('latitude/longitude invalid', 422)
    }

    // Location name:
    // Use frontend location if available.
    // Otherwise reverse-geocode coordinates.
    let locationName =
      typeof location === 'string' && location.trim()
        ? location.trim()
        : ''

    if (!locationName) {
      const geocoded = await reverseGeocode(lat, lng)

      locationName =
        geocoded?.shortName || 'Location name unavailable'
    }

    // Validate optional image metadata
    let imageMetaJson: string | null = null

    if (imageMeta && typeof imageMeta === 'object') {
      const ct = String(imageMeta.contentType || '')

      if (/executable|php|javascript|text\/html/i.test(ct)) {
        return err('File type not allowed', 422)
      }

      const size = Number(imageMeta.size || 0)

      if (size > 10 * 1024 * 1024) {
        return err('Image too large (max 10MB)', 422)
      }

      imageMetaJson = JSON.stringify({
        filename: String(imageMeta.filename || 'upload'),
        size,
        contentType: ct,
      })
    }

    // Normalize language
    const languageNorm =
      typeof language === 'string'
        ? language.slice(0, 5).toLowerCase()
        : null

    // Normalize input method
    const inputMethodNorm =
      ['text', 'voice'].includes(inputMethod)
        ? inputMethod
        : 'text'

    // Optional location metadata
    const accuracy =
      locationAccuracy != null
        ? Number(locationAccuracy)
        : null

    const locTimestamp =
      locationTimestamp
        ? new Date(locationTimestamp)
        : null

    // Generate incident code
    const year = new Date().getFullYear()

    const count = await db.incident.count()

    const incidentCode = `RF-${year}-${String(
      count + 1,
    ).padStart(6, '0')}`

    // Create incident
    const incident = await db.incident.create({
      data: {
        incidentCode,

        type: incidentType,

        description: description.trim(),

        // Authenticated citizen identity
        citizenName: dbUser.name,
        citizenPhone: dbUser.phone || null,
        citizenEmail: dbUser.email,

        // Original input
        originalDescription: description.trim(),

        transcription:
          inputMethodNorm === 'voice'
            ? description.trim()
            : null,

        language: languageNorm,

        inputMethod: inputMethodNorm,

        // Location
        location: locationName,
        latitude: lat,
        longitude: lng,

        locationAccuracy:
          accuracy != null && !Number.isNaN(accuracy)
            ? accuracy
            : null,

        locationTimestamp:
          locTimestamp &&
          !Number.isNaN(locTimestamp.getTime())
            ? locTimestamp
            : null,

        imageMeta: imageMetaJson,

        status: 'NEW',

        // Always from authenticated session
        reportedById: user.id,
      },
    })

    // Incident event
    await recordIncidentEvent(
      incident.id,
      'INCIDENT_CREATED',
      {
        label: `${incident.incidentCode}: ${incident.type} reported at ${incident.location}`,
        code: incident.incidentCode,
        type: incident.type,
        language: languageNorm,
        inputMethod: inputMethodNorm,
      },
    )

    // Audit event
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'INCIDENT_CREATED',
      entityId: incident.id,
      newState: incident.type,
      reason: `Citizen report: ${incident.incidentCode} (lang=${
        languageNorm || 'unknown'
      }, method=${inputMethodNorm})`,
    })

    // Broadcast
    await broadcastEvent({
      type: 'INCIDENT_CREATED',
      label: `${incident.incidentCode} created`,
      incidentId: incident.id,
    })

    // Run AI / automation asynchronously
    runIncidentWorkflow(incident.id).catch((e) =>
      console.error(
        '[incidents] workflow async error:',
        e,
      ),
    )

    return ok(
      {
        id: incident.id,

        incidentCode: incident.incidentCode,

        status: incident.status,

        type: incident.type,

        citizen: {
          id: user.id,
          name: dbUser.name,

          phone: dbUser.phone
            ? dbUser.phone.slice(0, 4) +
              '***' +
              dbUser.phone.slice(-2)
            : null,

          email: dbUser.email,
        },

        location: {
          name: locationName,
          lat,
          lng,
          accuracy: accuracy ?? null,
        },

        language: languageNorm,

        inputMethod: inputMethodNorm,

        message:
          'Incident received. AI analysis started.',
      },
      201,
    )
  } catch (e) {
    return handleAuthError(e)
  }
}

// GET /api/incidents
//
// Citizen  → own incidents
// Officer/Admin → all incidents
// Responder → own reports + incidents assigned through ResourceAssignment
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()

    const { searchParams } = new URL(req.url)

    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const sortBy = searchParams.get('sortBy')

    const requestedLimit = Number(
      searchParams.get('limit') || 100,
    )

    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(200, requestedLimit)
        : 100

    let where: any = {}

    // Optional status filter
    if (status) {
      where.status = status
    }

    // Optional type filter
    if (type) {
      where.type = type
    }

    // Citizen → only own incidents
    if (user.role === 'CITIZEN') {
      where.reportedById = user.id
    }

    // Responder → assigned/active incidents + own reports
    else if (user.role === 'RESPONDER') {
      where.OR = [
        {
          reportedById: user.id,
        },

        // IMPORTANT:
        // Use the actual Prisma relation name from your
        // Incident model: ResourceAssignment.
        {
          ResourceAssignment: {
            some: {
              assignedById: user.id,
            },
          },
        },

        // Active incidents that already have a resource assigned.
        {
          status: {
            in: [
              'ASSIGNED',
              'IN_PROGRESS',
              'DELAYED',
              'ESCALATED',
            ],
          },

          assignedResourceId: {
            not: null,
          },
        },
      ]
    }

    // Officer/Admin → all incidents
    // No additional filter required.

    const orderBy: any =
      sortBy === 'priority'
        ? [
            {
              riskScore: 'desc',
            },
            {
              createdAt: 'desc',
            },
          ]
        : {
            createdAt: 'desc',
          }

    const incidents = await db.incident.findMany({
      where,
      orderBy,
      take: limit,

      include: {
        User: {
          select: {
            name: true,
          },
        },
      },
    })

    return ok({
      incidents,
    })
  } catch (e) {
    console.error(
      '[GET /api/incidents] error:',
      e,
    )

    return handleAuthError(e)
  }
}