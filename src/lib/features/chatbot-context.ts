// AI Chatbot context builder — extends the existing /api/ai/chat handler.
// Adds (per role) authoritative snapshots for:
//   • Resource conflicts (officer/admin)
//   • Missing information (citizen, for THEIR incident)
//   • Nearest help (citizen, for THEIR authorized location)
//   • Route status (responder/officer for assigned incidents)
//   • Offline sync status (citizen, queued reports on device)
// NEVER invents data. If real data is unavailable, the snapshot says so.
import { db } from '@/lib/db'
import { detectResourceConflicts } from '@/lib/features/conflict-detector'
import { findNearestHelp } from '@/lib/features/nearest-help'
import { searchNearbyPlaces } from '@/lib/features/nearby-places'
import { detectMissingInformationForIncidentId, summarizeForCitizen } from '@/lib/features/missing-info-detector'
import { buildRouteForAssignment } from '@/lib/features/rescue-route'

export async function buildChatbotContext(role: string, userId: string): Promise<string> {
  const out: string[] = []

  try {
    if (role === 'ADMIN' || role === 'DISASTER_OFFICER' || role === 'RESPONDER') {
      const conflicts = await detectResourceConflicts()
      if (!conflicts.available) {
        out.push('RESOURCE CONFLICTS: DATA UNAVAILABLE.')
      } else if (conflicts.totalResourcesInConflict === 0) {
        out.push('RESOURCE CONFLICTS: none detected across all assignments.')
      } else {
        out.push(`RESOURCE CONFLICTS: ${conflicts.totalResourcesInConflict} resource(s) in conflict (${conflicts.totalConflicts} assignment refs).`)
        for (const c of conflicts.conflicts.slice(0, 5)) {
          out.push(
            `  - ${c.resourceCode} (${c.resourceName}, type=${c.resourceType}, status=${c.resourceStatus}) — conflicts across: ${c.conflicts
              .map((cc) => `${cc.incidentCode}/${cc.incidentType}/priority=${cc.incidentPriority ?? 'n/a'}`)
              .join(', ')}. Recommendation: ${c.recommendation.summary}`,
          )
        }
      }
    }

    if (role === 'CITIZEN') {
      // The most recent non-RESOLVED incident owned by this citizen
      const own = await db.incident.findFirst({
        where: {
          reportedById: userId,
          status: { notIn: ['RESOLVED', 'CLOSED'] },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          incidentCode: true,
          type: true,
          latitude: true,
          longitude: true,
          location: true,
        },
      })

      if (own) {
        const missing = await detectMissingInformationForIncidentId(own.id)
        out.push(
          `CITIZEN INCIDENT ${own.incidentCode}: type=${own.type}, location=${own.location} (${own.latitude.toFixed(4)}, ${own.longitude.toFixed(4)})`,
        )
        if (missing.available) {
          out.push('CITIZEN MISSING INFORMATION: ' + summarizeForCitizen(missing))
        }

        const nearest = await findNearestHelp({ lat: own.latitude, lng: own.longitude, kind: 'all', limit: 6 })
        if (!nearest.available) {
          out.push('CITIZEN NEAREST HELP: DATA UNAVAILABLE.')
        } else if (nearest.items.length === 0) {
          out.push('CITIZEN NEAREST HELP: no matching help is currently indexed for the authorized location.')
        } else {
          out.push('CITIZEN NEAREST HELP (top options, ranked by relevance/availability/distance):')
          for (const it of nearest.items.slice(0, 6)) {
            out.push(
              `  - ${it.kind}/${it.category}/${it.status}: ${it.name} — ${it.distanceKm.toFixed(2)} km${it.estimatedMinutes ? ` (~${it.estimatedMinutes} min)` : ''}`,
            )
          }
        }

        // Real-time nearby emergency places (OpenStreetMap Overpass) around the
        // citizen's incident location — used to answer "I need a hospital" etc.
        try {
          const result = await searchNearbyPlaces({ lat: own.latitude, lng: own.longitude, radius: 8000, limit: 8 })
          const pls = result.places
          if (result.unavailable) {
            out.push('CITIZEN NEARBY PLACES: live place search unavailable right now.')
          } else if (pls.length === 0) {
            out.push('CITIZEN NEARBY PLACES: no OpenStreetMap emergency places found nearby.')
          } else {
            out.push('CITIZEN NEARBY PLACES (real OpenStreetMap data; use these names/addresses only):')
            for (const p of pls) {
              out.push(`  - ${p.categoryLabel}: ${p.name} — ${p.distanceKm} km${p.address ? `, ${p.address}` : ''}${p.phone ? `, phone ${p.phone}` : ', phone unavailable'}`)
            }
            out.push('When the citizen asks for hospitals/shelters/pharmacies, recommend from this list and point them to the Safety Center → Nearby Help tab for directions. Never invent place names.')
          }
        } catch {
          out.push('CITIZEN NEARBY PLACES: live place search unavailable right now.')
        }
      } else {
        out.push('CITIZEN has no active incident on record.')
      }
    }

    if (role === 'RESPONDER' || role === 'DISASTER_OFFICER' || role === 'ADMIN') {
      // For the responder: show route status of the most recent active assignment
      const assignments = await db.resourceAssignment.findMany({
        where: {
          replacedAt: null,
          status: { in: ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'ARRIVED'] },
        },
        orderBy: { assignedAt: 'desc' },
        take: 3,
        include: {
          Resource: { select: { id: true, resourceCode: true } },
          Incident: { select: { id: true, incidentCode: true } },
        },
      })
      // For Responder, only consider assignments made by themselves
      const scoped =
        role === 'RESPONDER' ? assignments.filter((a) => a.assignedById === userId) : assignments
      for (const a of scoped) {
        const r = await buildRouteForAssignment({ resourceId: a.Resource.id, incidentId: a.Incident.id })
        if (!r.available) {
          out.push(`ROUTE STATUS for ${a.Incident.incidentCode} ← ${a.Resource.resourceCode}: DATA UNAVAILABLE`)
        } else {
          out.push(
            `ROUTE STATUS for ${a.Incident.incidentCode} ← ${a.Resource.resourceCode}: ${r.routeStatus} · distance ${r.distanceKm.toFixed(2)} km · ETA ~${r.etaMinutes} min · currentSource=${r.currentLocation.source} · destinationSource=${r.destination.source}${r.risks.length ? ` · risks=${r.risks.join('; ')}` : ''
            }`,
          )
        }
      }
    }

    out.push(
      'OFFLINE / SYNC STATUS: client localStorage queue preserves all report fields during outages; the server only knows about reports marked SYNCED (SERVER RECEIVED).',
    )
  } catch (e) {
    out.push('CHATBOT CONTEXT: DATA UNAVAILABLE — live operational data could not be assembled.')
  }
  return out.join('\n')
}
