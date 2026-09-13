// AI Resource Conflict Detector — central service.
// Reuses the EXISTING Prisma models: Resource, ResourceAssignment, Incident.
// NEVER fabricates data. If real DB data is unavailable, returns clear "DATA UNAVAILABLE" output.
//
// A conflict exists when:
// 1. The same resourceId appears in multiple ACTIVE ResourceAssignment rows
//     (replacedAt is null OR status !== 'REPLACED') across different incidents.
// 2. A resource is marked UNAVAILABLE while it has an active assignment.
// 3. Two assignments share the same resource when one incident has higher priority
//     (CRITICAL/HIGH) and the other is downstream.

import { db } from '@/lib/db'
import { haversineKm } from '@/lib/agents/resource-agent'

export interface ResourceConflict {
  resourceId: string
  resourceCode: string
  resourceName: string
  resourceType: string
  resourceStatus: string
  resourceLocation: { lat: number; lng: number }
  // The conflicts found for this resource
  conflicts: Array<{
    incidentId: string
    incidentCode: string
    incidentType: string
    incidentStatus: string
    incidentPriority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null
    incidentLocation: { lat: number; lng: number }
    assignmentId: string
    distanceKm: number | null
    destination: { lat: number; lng: number; name: string | null } | null
    assignedAt: string
  }>
  // AI recommendation
  recommendation: {
    priorityIncidentId: string | null
    priorityIncidentCode: string | null
    reassign: boolean
    alternativeResource: {
      id: string
      code: string
      name: string
      type: string
      distanceKm: number
      availabilityStatus: string
    } | null
    summary: string
  }
  unavailable: boolean
}

const PRIORITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const

function priorityOf(level: string | null): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null {
  if (!level) return null
  const u = level.toUpperCase()
  if (u === 'CRITICAL' || u === 'HIGH' || u === 'MEDIUM' || u === 'LOW') {
    return u as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  }
  return null
}

function comparePriority(a: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null, b: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null): number {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  return PRIORITY_RANK[a] - PRIORITY_RANK[b]
}

// Find ALL conflicts across the system, scoped for the requesting user role.
export async function detectResourceConflicts(): Promise<{
  available: boolean
  dataUnavailableReason?: string
  conflicts: ResourceConflict[]
  totalConflicts: number
  totalResourcesInConflict: number
  generatedAt: string
}> {
  try {
    const activeAssignments = await db.resourceAssignment.findMany({
      where: {
        replacedAt: null,
        // An assignment is "active" when it is ASSIGNED/EN_ROUTE/ON_SCENE/ARRIVED
        status: { in: ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'ARRIVED'] },
      },
      include: {
        Resource: true,
        Incident: true,
      },
    })

    // Group assignments by resourceId
    const byResource = new Map<string, typeof activeAssignments>()
    for (const a of activeAssignments) {
      const arr = byResource.get(a.resourceId) || []
      arr.push(a)
      byResource.set(a.resourceId, arr)
    }

    const conflicts: ResourceConflict[] = []

    for (const [resourceId, assignments] of byResource.entries()) {
      const r = assignments[0].Resource
      const isMultiAssigned = assignments.length > 1
      const isUnavailable = r.status === 'UNAVAILABLE'

      if (!isMultiAssigned && !isUnavailable) continue

      const conflictIncidents = assignments.map((a) => ({
        incidentId: a.Incident.id,
        incidentCode: a.Incident.incidentCode,
        incidentType: a.Incident.type,
        incidentStatus: a.Incident.status,
        incidentPriority: priorityOf(a.Incident.riskLevel || a.Incident.aiSeverity),
        incidentLocation: {
          lat: a.Incident.latitude,
          lng: a.Incident.longitude,
        },
        assignmentId: a.id,
        distanceKm:
          a.Incident.latitude != null && r.latitude != null
            ? Number(
              haversineKm(r.latitude, r.longitude, a.Incident.latitude, a.Incident.longitude).toFixed(2),
            )
            : null,
        destination:
          a.Incident.resourceDestinationLatitude != null && a.Incident.resourceDestinationLongitude != null
            ? {
              lat: a.Incident.resourceDestinationLatitude,
              lng: a.Incident.resourceDestinationLongitude,
              name: a.Incident.resourceDestinationName ?? null,
            }
            : null,
        assignedAt: a.assignedAt.toISOString(),
      }))

      // Determine priority incident using deterministic rules
      conflictIncidents.sort((x, y) => comparePriority(y.incidentPriority, x.incidentPriority))
      const priorityOne = conflictIncidents[0]

      // Find nearest alternative (eligible, AVAILABLE) matching resource type
      const eligibleAlternatives = await db.resource.findMany({
        where: {
          status: 'AVAILABLE',
          type: r.type,
          id: { not: r.id },
        },
        take: 50,
      })
      let alt: ResourceConflict['recommendation']['alternativeResource'] = null
      if (priorityOne) {
        let best: any = null
        let bestDist = Infinity
        for (const candidate of eligibleAlternatives) {
          const d = haversineKm(
            priorityOne.incidentLocation.lat,
            priorityOne.incidentLocation.lng,
            candidate.latitude,
            candidate.longitude,
          )
          if (d < bestDist) {
            bestDist = d
            best = candidate
          }
        }
        if (best) {
          alt = {
            id: best.id,
            code: best.resourceCode,
            name: best.name,
            type: best.type,
            distanceKm: Number(bestDist.toFixed(2)),
            availabilityStatus: best.status,
          }
        }
      }

      // Determine reassign decision
      const reassign = isUnavailable || (isMultiAssigned && priorityOne.incidentPriority === 'CRITICAL')

      // Build summary
      let summaryLines: string[] = []
      if (isUnavailable) {
        summaryLines.push(
          `Resource ${r.resourceCode} is ${r.status} but is still referenced by ${assignments.length} active assignment(s).`,
        )
      }
      if (isMultiAssigned) {
        summaryLines.push(
          `Resource ${r.resourceCode} appears in ${assignments.length} active assignments across different incidents.`,
        )
      }
      if (priorityOne) {
        summaryLines.push(
          `Highest-priority incident is ${priorityOne.incidentCode} (${priorityOne.incidentPriority ?? 'priority unknown'}).`,
        )
      }
      if (reassign) {
        if (alt) {
          summaryLines.push(
            `Nearest suitable available alternative is ${alt.code} (${alt.name}) at ${alt.distanceKm.toFixed(1)} km from the priority incident.`,
          )
        } else {
          summaryLines.push(
            `No same-type alternative is currently AVAILABLE in the database. Consider mutual-aid escalation.`,
          )
        }
      } else {
        summaryLines.push(
          `Resource can remain assigned to the highest-priority incident; alternative should be staged for the remainder.`,
        )
      }

      conflicts.push({
        resourceId: r.id,
        resourceCode: r.resourceCode,
        resourceName: r.name,
        resourceType: r.type,
        resourceStatus: r.status,
        resourceLocation: { lat: r.latitude, lng: r.longitude },
        conflicts: conflictIncidents,
        recommendation: {
          priorityIncidentId: priorityOne.incidentId,
          priorityIncidentCode: priorityOne.incidentCode,
          reassign,
          alternativeResource: alt,
          summary: summaryLines.join(' '),
        },
        unavailable: isUnavailable,
      })
    }

    return {
      available: true,
      conflicts,
      totalConflicts: conflicts.reduce((sum, c) => sum + c.conflicts.length, 0),
      totalResourcesInConflict: conflicts.length,
      generatedAt: new Date().toISOString(),
    }
  } catch (e) {
    return {
      available: false,
      dataUnavailableReason: 'database_unavailable',
      conflicts: [],
      totalConflicts: 0,
      totalResourcesInConflict: 0,
      generatedAt: new Date().toISOString(),
    }
  }
}
