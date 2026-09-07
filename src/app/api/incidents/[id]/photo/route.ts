import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { recordAudit, broadcastEvent } from '@/lib/events'

// POST /api/incidents/[id]/photo - Upload photo evidence
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const { id } = await params

    const incident = await db.incident.findUnique({
      where: { id },
      select: { id: true, incidentCode: true, imageMeta: true, reportedById: true, description: true },
    })

    if (!incident) return err('Incident not found', 404)

    if (user.role === 'CITIZEN' && incident.reportedById !== user.id) {
      return err('Unauthorized', 403)
    }

    const formData = await req.formData()
    const file = formData.get('photo') as File | null
    if (!file) return err('No photo file provided', 400)

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return err('Invalid file type. Allowed: JPEG, PNG, WebP, GIF', 400)
    }

    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return err('File too large. Maximum size: 10MB', 400)
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const dataUri = `data:${file.type};base64,${base64}`

    const photoData = {
      filename: file.name || 'evidence',
      contentType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.id,
      dataUri,
    }

    let existingPhotos: any[] = []
    if (incident.imageMeta) {
      try {
        const parsed = JSON.parse(incident.imageMeta)
        existingPhotos = Array.isArray(parsed) ? parsed : [parsed]
      } catch { /* ignore */ }
    }

    existingPhotos.push(photoData)

    await db.incident.update({
      where: { id },
      data: { imageMeta: JSON.stringify(existingPhotos) },
    })

    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'PHOTO_UPLOADED',
      entityId: id,
      newState: 'Photo uploaded',
      reason: `Evidence photo added to ${incident.incidentCode}`,
    })

    await broadcastEvent({
      type: 'PHOTO_UPLOADED',
      label: `Photo uploaded for ${incident.incidentCode}`,
      incidentId: id,
    })

    return ok({
      success: true,
      incidentCode: incident.incidentCode,
      photoId: `${id}-${existingPhotos.length}`,
      filename: photoData.filename,
      message: 'Photo uploaded successfully',
    }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}

// GET /api/incidents/[id]/photo - Get photos for an incident
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const { id } = await params

    const incident = await db.incident.findUnique({
      where: { id },
      select: {
        id: true,
        incidentCode: true,
        imageMeta: true,
        reportedById: true,
        type: true,
        location: true,
      },
    })

    if (!incident) return err('Incident not found', 404)

    // Authorization check
    if (user.role === 'CITIZEN' && incident.reportedById !== user.id) {
      return err('Unauthorized', 403)
    }

    // Parse photos
    let photos: any[] = []
    if (incident.imageMeta) {
      try {
        const parsed = JSON.parse(incident.imageMeta)
        photos = Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        photos = []
      }
    }

    // For citizens, return metadata only
    if (user.role === 'CITIZEN') {
      const citizenPhotos = photos.map((p, idx) => ({
        id: `${id}-${idx + 1}`,
        filename: p.filename,
        contentType: p.contentType,
        size: p.size,
        uploadedAt: p.uploadedAt,
        hasImage: !!p.dataUri,
      }))
      return ok({ photos: citizenPhotos })
    }

    // For officer/admin, return full data including base64
    return ok({
      incidentCode: incident.incidentCode,
      incidentType: incident.type,
      location: incident.location,
      photos: photos.map((p, idx) => ({
        id: `${id}-${idx + 1}`,
        filename: p.filename,
        contentType: p.contentType,
        size: p.size,
        uploadedAt: p.uploadedAt,
        dataUri: p.dataUri,
      })),
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
