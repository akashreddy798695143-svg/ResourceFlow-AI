// Dynamic Rescue Route — intelligent route recommendation that reuses the
// EXISTING ResourceDestination model + ResourceTrackingEvent timeline + Incident
// model. It does NOT invent road closures; it only displays known data.
//
// Inputs:
//   - Resource current location (Resource.latitude/longitude, updated via ResourceTrackingEvent)
//   - Destination (ResourceDestination table for this resource+incident, or incident.resourceDestination*)
//   - Distance + ETA + status (already provided by haversine math)
//   - Known factors from DB (latest ResourceTrackingEvent details JSON if present)
//
// If a ResourceDestination row exists in the DB mapping the resource to a hospital / safe zone /
// incident, we honour that and report ROUTE STATUS accordingly.

import { db } from '@/lib/db'
import { haversineKm, estimateEtaMinutes } from '@/lib/agents/resource-agent'

function safeParse(text: string): any {
  try { return JSON.parse(text) } catch { return null }
}

export interface RouteSummary {
  available: boolean
  dataUnavailableReason?: string
  resourceId: string
  resourceCode: string
  currentLocation: { lat: number; lng: number; source: string; timestamp: string | null }
  destination: { lat: number; lng: number; name: string; type: string; source: string }
  distanceKm: number
  etaMinutes: number
  routeStatus: 'OK' | 'ROUTE_RISK_DETECTED' | 'NO_DATA'
  risks: string[]
  alternativeRouteAvailable: boolean
  lastEvent: {
    status: string | null
    timestamp: string | null
    details: any
  } | null
  generatedAt: string
}

export async function buildRouteForAssignment(params: {
  resourceId: string
  incidentId: string
}): Promise<RouteSummary> {
  try {
    const [resource, incident, destination, latestEvent] = await Promise.all([
      db.resource.findUnique({ where: { id: params.resourceId } }),
      db.incident.findUnique({ where: { id: params.incidentId } }),
      db.resourceDestination.findFirst({
        where: { resourceId: params.resourceId, incidentId: params.incidentId, status: { in: ['EN_ROUTE', 'ARRIVED'] } },
        orderBy: { lastUpdated: 'desc' },
      }),
      db.resourceTrackingEvent.findFirst({
        where: { resourceId: params.resourceId, OR: [{ incidentId: params.incidentId }, { assignmentId: { not: null } }] },
        orderBy: { timestamp: 'desc' },
      }),
    ])

    if (!resource || !incident) {
      return {
        available: false,
        dataUnavailableReason: 'not_found',
        resourceId: params.resourceId,
        resourceCode: resource?.resourceCode ?? '?',
        currentLocation: { lat: resource?.latitude ?? 0, lng: resource?.longitude ?? 0, source: 'database', timestamp: null },
        destination: { lat: incident?.latitude ?? 0, lng: incident?.longitude ?? 0, name: incident?.location ?? 'Destination', type: 'INCIDENT', source: 'incident' },
        distanceKm: 0,
        etaMinutes: 0,
        routeStatus: 'NO_DATA',
        risks: [],
        alternativeRouteAvailable: false,
        lastEvent: null,
        generatedAt: new Date().toISOString(),
      }
    }

    // Determine current location: latest tracking event overrides Resource location if available.
    let curLat = resource.latitude
    let curLng = resource.longitude
    let curSource = 'resource_static'
    let curTimestamp: string | null = resource.lastUpdated.toISOString()
    if (latestEvent && latestEvent.latitude != null && latestEvent.longitude != null) {
      curLat = latestEvent.latitude
      curLng = latestEvent.longitude
      curSource = 'resource_tracking_event'
      curTimestamp = latestEvent.timestamp.toISOString()
    }

    // Determine destination priority: ResourceDestination → incident destination → incident location
    let destLat = incident.latitude
    let destLng = incident.longitude
    let destName = incident.resourceDestinationName || incident.location
    let destType = incident.resourceDestinationType || 'INCIDENT'
    let destSource = 'incident'

    if (incident.resourceDestinationLatitude != null && incident.resourceDestinationLongitude != null) {
      destLat = incident.resourceDestinationLatitude
      destLng = incident.resourceDestinationLongitude
      destName = incident.resourceDestinationName || destName
      destType = incident.resourceDestinationType || destType
      destSource = 'incident_overridden_destination'
    }
    if (destination) {
      destLat = destination.latitude
      destLng = destination.longitude
      destName = destination.name
      destType = destination.destinationType
      destSource = 'resource_destination'
    }

    const distanceKm = Number(haversineKm(curLat, curLng, destLat, destLng).toFixed(2))
    const roadBlocked = Boolean(incident.aiRoadBlocked)
    const etaMinutes = estimateEtaMinutes(distanceKm, roadBlocked || incident.type === 'ROAD_BLOCKAGE')

    // Risk detection — only based on real DB facts
    const risks: string[] = []
    if (resource.status === 'UNAVAILABLE') {
      risks.push('Resource is marked UNAVAILABLE in the database.')
    }
    if (roadBlocked) {
      risks.push('Road-blockage flag is set on the incident.')
    }
    if (destination && destination.etaMinutes != null) {
      // already known from a previous assignment, the system has a planned eta
      // if the planned ETA is substantially shorter than the haversine estimate, it means a planned route exists
    }
    if (distanceKm > 0 && etaMinutes > 60) {
      risks.push('Estimated travel time exceeds 60 minutes.')
    }
    if ((incident.type === 'LANDSLIDE' || incident.type === 'FLOOD') && distanceKm > 0 && !roadBlocked) {
      // disaster zone crossing
      risks.push('Route may traverse a known disaster zone.')
    }

    const routeStatus: 'OK' | 'ROUTE_RISK_DETECTED' | 'NO_DATA' =
      risks.length === 0 ? 'OK' : 'ROUTE_RISK_DETECTED'

    let alternativeRouteAvailable = false
    if (routeStatus === 'ROUTE_RISK_DETECTED') {
      // Look for an alternative ResourceDestination pointing to a safe-zone/hospital at different coords
      const alt = await db.resourceDestination.findFirst({
        where: {
          resourceId: params.resourceId,
          incidentId: params.incidentId,
          id: { not: destination?.id ?? '__none__' },
        },
      })
      alternativeRouteAvailable = !!alt
    }

    return {
      available: true,
      resourceId: resource.id,
      resourceCode: resource.resourceCode,
      currentLocation: { lat: curLat, lng: curLng, source: curSource, timestamp: curTimestamp },
      destination: { lat: destLat, lng: destLng, name: destName, type: destType, source: destSource },
      distanceKm,
      etaMinutes,
      routeStatus,
      risks,
      alternativeRouteAvailable,
      lastEvent: latestEvent
        ? {
            status: latestEvent.status,
            timestamp: latestEvent.timestamp.toISOString(),
            details: latestEvent.details ? safeParse(latestEvent.details) : null,
          }
        : null,
      generatedAt: new Date().toISOString(),
    }
  } catch (e) {
    return {
      available: false,
      dataUnavailableReason: 'database_unavailable',
      resourceId: params.resourceId,
      resourceCode: '?',
      currentLocation: { lat: 0, lng: 0, source: 'unknown', timestamp: null },
      destination: { lat: 0, lng: 0, name: 'Unknown', type: 'INCIDENT', source: 'unknown' },
      distanceKm: 0,
      etaMinutes: 0,
      routeStatus: 'NO_DATA',
      risks: [],
      alternativeRouteAvailable: false,
      lastEvent: null,
      generatedAt: new Date().toISOString(),
    }
  }
}
