// AI RESPONSE INTELLIGENCE API — the 10 game-changer features.
// GET  /api/response-intel?feature=<name>[&incidentId=&resourceId=&lat=&lng=&kind=&limit=]
// POST /api/response-intel  { action, ...payload }   — run feature actions
// RBAC via existing requireAuth + roleAllows. Citizens are strictly scoped to
// their own incidents and authorized location.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError, roleAllows } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { detectResourceConflicts } from '@/lib/features/conflict-detector'
import { findNearestHelp } from '@/lib/features/nearest-help'
import {
  generateMissionPlan, buildRescueCorridor, getDisasterTwin, simulateTwinScenario,
  recommendResourceSwap, predictEtaRisk, matchSafeShelter, computePrePositioning,
  buildDamageClusters, analyzePhotoImpact, getResponseIntelOverview,
} from '@/lib/services/response-intel-service'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const url = new URL(req.url)
    const feature = url.searchParams.get('feature')
    const incidentId = url.searchParams.get('incidentId') || undefined
    const resourceId = url.searchParams.get('resourceId') || undefined
    const lat = url.searchParams.get('lat') ? Number(url.searchParams.get('lat')) : undefined
    const lng = url.searchParams.get('lng') ? Number(url.searchParams.get('lng')) : undefined
    const limit = url.searchParams.get('limit') ? Math.max(1, Math.min(10, Number(url.searchParams.get('limit')))) : 5

    // Citizen safety helper — ensure any incidentId supplied belongs to the citizen.
    async function assertIncidentAccess(id?: string) {
      if (!id) return true
      const inc = await db.incident.findUnique({ where: { id }, select: { reportedById: true } })
      if (!inc) return false
      if (user.role === 'CITIZEN' && inc.reportedById !== user.id) return false
      return true
    }

    switch (feature) {
      case 'overview':
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        return ok(await getResponseIntelOverview(incidentId))
      case 'mission-plan': {
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        if (!(await assertIncidentAccess(incidentId))) return err('Forbidden', 403)
        if (!incidentId) return err('incidentId required', 422)
        return ok(await generateMissionPlan(incidentId, user.id))
      }
      case 'corridor': {
        if (!(await assertIncidentAccess(incidentId))) return err('Forbidden', 403)
        if (!incidentId) return err('incidentId required', 422)
        return ok(await buildRescueCorridor(incidentId, resourceId))
      }
      case 'twin':
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        if (!(await assertIncidentAccess(incidentId))) return err('Forbidden', 403)
        return ok(await getDisasterTwin(incidentId))
      case 'swap': {
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        if (!(await assertIncidentAccess(incidentId))) return err('Forbidden', 403)
        if (!incidentId) return err('incidentId required', 422)
        return ok(await recommendResourceSwap(incidentId, user.id))
      }
      case 'eta-risk': {
        if (!incidentId || !resourceId) return err('incidentId and resourceId required', 422)
        if (!(await assertIncidentAccess(incidentId))) return err('Forbidden', 403)
        return ok(await predictEtaRisk(incidentId, resourceId))
      }
      case 'shelter':
        return ok(await matchSafeShelter({ lat, lng, incidentId, limit }))
      case 'prepositioning':
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        return ok(await computePrePositioning())
      case 'damage-clusters': {
        const result = await buildDamageClusters()
        // Citizens only see the public-safe subset (no citizen identity).
        if (user.role === 'CITIZEN') {
          return ok({
            ...result,
            clusters: result.clusters.map((c) => ({
              clusterKey: c.clusterKey,
              centerLat: c.centerLat,
              centerLng: c.centerLng,
              layers: c.layers,
              highRisk: c.highRisk,
            })),
          })
        }
        return ok(result)
      }
      case 'photo': {
        if (!(await assertIncidentAccess(incidentId))) return err('Forbidden', 403)
        if (!incidentId) return err('incidentId required', 422)
        return ok(await analyzePhotoImpact({ incidentId }, user.id))
      }
      case 'conflicts':
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        return ok(await detectResourceConflicts())
      case 'nearest-help':
        return ok(await findNearestHelp({ lat: lat ?? 0, lng: lng ?? 0, kind: (url.searchParams.get('kind') as any) || 'all', limit }))
      default:
        return err('Unknown feature', 422)
    }
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = parseBody(await req.json())
    const action = String(body?.action || '')

    switch (action) {
      case 'twin-simulate': {
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        const scenario = body?.scenario
        if (!['ROAD_BLOCKED', 'RESOURCE_UNAVAILABLE', 'NEW_INCIDENT_NEARBY'].includes(scenario)) return err('Invalid scenario', 422)
        return ok(await simulateTwinScenario({ incidentId: body?.incidentId, scenario, resourceCode: body?.resourceCode }, user.id))
      }
      case 'photo-analyze': {
        const incidentId = String(body?.incidentId || '')
        if (!incidentId) return err('incidentId required', 422)
        const inc = await db.incident.findUnique({ where: { id: incidentId }, select: { reportedById: true } })
        if (!inc) return err('Incident not found', 404)
        if (user.role === 'CITIZEN' && inc.reportedById !== user.id) return err('Forbidden', 403)
        return ok(await analyzePhotoImpact({
          incidentId,
          imageMeta: body?.imageMeta ?? null,
          incidentType: body?.incidentType ?? null,
          description: body?.description ?? null,
        }, user.id))
      }
      case 'shelter-match':
        return ok(await matchSafeShelter({ lat: body?.lat, lng: body?.lng, incidentId: body?.incidentId, incidentType: body?.incidentType, peopleAffected: body?.peopleAffected, limit: body?.limit }))
      case 'generate-plan': {
        if (!roleAllows('advanced:read', user.role)) return err('Forbidden', 403)
        const incidentId = String(body?.incidentId || '')
        if (!incidentId) return err('incidentId required', 422)
        return ok(await generateMissionPlan(incidentId, user.id))
      }
      default:
        return err('Unknown action', 422)
    }
  } catch (e) {
    return handleAuthError(e)
  }
}

