import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { recordIncidentEvent, recordAudit, broadcastEvent } from '@/lib/events'
import { runIncidentWorkflow } from '@/lib/workflows/incident-workflow'
import type { IncidentType } from '@prisma/client'

const ALLOWED: IncidentType[] = [
  'FLOOD', 'CYCLONE', 'EARTHQUAKE', 'LANDSLIDE', 'ROAD_BLOCKAGE', 'FIRE', 'MEDICAL', 'INFRASTRUCTURE', 'OTHER',
]

// POST /api/incidents — citizen (or officer/admin) reports a new incident
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const body = parseBody(await req.json())
    const { incidentType, description, location, latitude, longitude, imageMeta } = body

    if (!ALLOWED.includes(incidentType)) return err('Invalid incidentType', 422)
    if (!description || typeof description !== 'string' || description.trim().length < 5) {
      return err('description must be at least 5 characters', 422)
    }
    if (location == null) return err('location is required', 422)
    const lat = Number(latitude)
    const lng = Number(longitude)
    if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return err('latitude/longitude invalid', 422)
    }

    // Validate optional image metadata
    let imageMetaJson: string | null = null
    if (imageMeta && typeof imageMeta === 'object') {
      const ct = String(imageMeta.contentType || '')
      if (/executable|php|javascript|text\/html/i.test(ct)) return err('File type not allowed', 422)
      const size = Number(imageMeta.size || 0)
      if (size > 10 * 1024 * 1024) return err('Image too large (max 10MB)', 422)
      imageMetaJson = JSON.stringify({ filename: String(imageMeta.filename || 'upload'), size, contentType: ct })
    }

    // Generate RF-YYYY-000001 style code
    const year = new Date().getFullYear()
    const count = await db.incident.count()
    const incidentCode = `RF-${year}-${String(count + 1).padStart(6, '0')}`

    const incident = await db.incident.create({
      data: {
        incidentCode,
        type: incidentType,
        description: description.trim(),
        location: String(location),
        latitude: lat,
        longitude: lng,
        imageMeta: imageMetaJson,
        status: 'NEW',
        reportedById: user.id,
      },
    })

    await recordIncidentEvent(incident.id, 'INCIDENT_CREATED', {
      label: `${incident.incidentCode}: ${incident.type} reported at ${incident.location}`,
      code: incident.incidentCode,
      type: incident.type,
    })
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'INCIDENT_CREATED',
      entityId: incident.id,
      newState: incident.type,
      reason: `Citizen report: ${incident.incidentCode}`,
    })
    await broadcastEvent({ type: 'INCIDENT_CREATED', label: `${incident.incidentCode} created`, incidentId: incident.id })

    // Fire the automation pipeline asynchronously (do not block the response)
    runIncidentWorkflow(incident.id).catch((e) =>
      console.error('[incidents] workflow async error:', e)
    )

    return ok(
      {
        id: incident.id,
        incidentCode: incident.incidentCode,
        status: incident.status,
        type: incident.type,
        message: 'Incident received. AI analysis started.',
      },
      201
    )
  } catch (e) {
    return handleAuthError(e)
  }
}

// GET /api/incidents — list incidents (officer/admin: all; citizen: own; responder: assigned)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const limit = Math.min(200, Number(searchParams.get('limit') || 100))

    let where: any = {}
    if (status) where.status = status
    if (type) where.type = type
    if (user.role === 'CITIZEN') {
      where.reportedById = user.id
    } else if (user.role === 'RESPONDER') {
      // Responder: assigned incidents + own reports
      where.OR = [{ reportedById: user.id }, { assignments: { some: { assignedById: user.id } } }]
    }

    const incidents = await db.incident.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { reportedBy: { select: { name: true } } },
    })
    return ok({ incidents })
  } catch (e) {
    return handleAuthError(e)
  }
}
