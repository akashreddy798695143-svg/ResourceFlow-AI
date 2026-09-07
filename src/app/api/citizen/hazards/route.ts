// Crowdsourced Hazard Map — GET map data (all roles), POST report (citizen+).
// POST runs AI hazard verification: duplicate detection → confidence score.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { recordAudit, broadcastEvent } from '@/lib/events'
import { findNearbyDuplicate, aiHazardVerify } from '@/lib/services/citizen-safety-service'
import type { HazardType, Severity } from '@prisma/client'

const HAZARD_TYPES: HazardType[] = ['FLOODING','BLOCKED_ROAD','DEBRIS','DOWNED_POWER_LINE','FIRE','STRUCTURAL_DAMAGE','LANDSLIDE','OTHER']

// GET /api/citizen/hazards?since=hours — public-safe hazard map data
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const sinceH = Number(new URL(req.url).searchParams.get('since') || 72)
    const since = new Date(Date.now() - (Number.isFinite(sinceH) ? sinceH : 72) * 3600 * 1000)
    const hazards = await db.hazardReport.findMany({
      where: { status: { not: 'DISMISSED' }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      // Privacy: no reporter identity leaves the server
      select: {
        id: true, hazardType: true, description: true, location: true,
        latitude: true, longitude: true, severity: true, status: true,
        aiConfidence: true, aiSummary: true, confirmCount: true,
        verified: true, createdAt: true,
      },
    })
    return NextResponse.json({ hazards })
  } catch (e) {
    return handleAuthError(e)
  }
}

// POST /api/citizen/hazards — submit a hazard report
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const body = await req.json().catch(() => ({}))
    const hazardType = HAZARD_TYPES.includes(body.hazardType) ? (body.hazardType as HazardType) : null
    const description = String(body.description || '').trim().slice(0, 1500)
    const latitude = Number(body.latitude)
    const longitude = Number(body.longitude)
    if (!hazardType || description.length < 5 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: 'hazardType, description and coordinates are required' }, { status: 422 })
    }
    const location = String(body.location || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`).slice(0, 300)
    const severity = (['LOW','MEDIUM','HIGH','CRITICAL'].includes(body.severity) ? body.severity : 'MEDIUM') as Severity
    const language = typeof body.language === 'string' ? body.language.slice(0, 5).toLowerCase() : null

    // Duplicate detection over the last 72h
    const recent = await db.hazardReport.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 72 * 3600 * 1000) }, status: { not: 'DISMISSED' } },
      select: { id: true, description: true, latitude: true, longitude: true, hazardType: true },
    })
    const dup = findNearbyDuplicate({ description, latitude, longitude, hazardType }, recent)
    let duplicateCount = 1
    if (dup) {
      const orig = await db.hazardReport.findFirst({ where: { id: dup.id }, select: { confirmCount: true } })
      duplicateCount = (orig?.confirmCount ?? 1) + 1
    }

    // AI verification (summary + confidence)
    const verify = await aiHazardVerify(description, duplicateCount)

    const hazard = await db.hazardReport.create({
      data: {
        reportedById: user.id,
        hazardType,
        description,
        location,
        latitude,
        longitude,
        severity,
        language,
        aiCategory: hazardType,
        aiConfidence: verify.confidence,
        aiSummary: verify.summary,
        duplicateOfId: dup?.id ?? null,
        clusterKey: dup ? dup.id : null,
      },
    })
    if (dup) {
      await db.hazardReport.update({
        where: { id: dup.id },
        data: { confirmCount: { increment: 1 }, aiConfidence: Math.max(verify.confidence, dup.confidence) },
      })
    }
    await recordAudit({ userId: user.id, role: user.role, action: 'HAZARD_REPORTED', entityId: hazard.id, newState: hazardType })
    await broadcastEvent({
      type: 'HAZARD_REPORTED',
      label: `Hazard ${hazardType} at ${location} (confidence ${(verify.confidence * 100).toFixed(0)}%)`,
      data: { id: hazard.id, hazardType, severity },
    })
    return NextResponse.json(
      {
        hazard: { id: hazard.id, hazardType, severity, aiConfidence: verify.confidence, aiSummary: verify.summary },
        duplicateOf: dup ? { id: dup.id, confidence: dup.confidence, distanceKm: dup.distanceKm } : null,
        source: verify.source,
        message: dup
          ? 'Report merged with a nearby matching hazard — confidence of the original report increased.'
          : 'Hazard report submitted to the command center.',
      },
      { status: 201 }
    )
  } catch (e) {
    return handleAuthError(e)
  }
}
