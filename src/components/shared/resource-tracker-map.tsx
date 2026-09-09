'use client'

import { useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import type { Incident, Resource } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

function resourceIcon() {
  return L.divIcon({
    html: `<div style="width:22px;height:22px;border-radius:4px;background:#3b82f6;border:2px solid white;box-shadow:0 0 0 1.5px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:bold">R</div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function destIcon() {
  return L.divIcon({
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#ef4444;border:2px solid white;box-shadow:0 0 0 1.5px rgba(0,0,0,0.4)"></div>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

export function ResourceTrackerMap({
  resource,
  incident,
  distanceKm,
  etaMin,
}: {
  resource: Resource
  incident: Incident
  distanceKm: number | null
  etaMin: number | null
}) {
  const from: [number, number] = [resource.latitude, resource.longitude]
  const to: [number, number] = [
    incident.resourceDestinationLatitude ?? resource.latitude,
    incident.resourceDestinationLongitude ?? resource.longitude,
  ]
  const positions = useMemo(() => [from, to], [from, to])

  return (
    <MapContainer center={[resource.latitude, resource.longitude]} zoom={13} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Marker position={from} icon={resourceIcon()}>
        <Popup>
          <div className="text-xs space-y-1 min-w-[180px]">
            <div><strong>Resource</strong> {resource.resourceCode} — {resource.name}</div>
            <div>Status: <Badge variant="secondary" className="text-[10px]">{resource.status}</Badge></div>
            {distanceKm != null && <div>Distance: {Math.round(distanceKm * 100) / 100} km</div>}
            {etaMin != null && <div>ETA: ~{etaMin} min (approximate)</div>}
            <div className="mt-1 text-[10px] text-muted-foreground">
              Route is a great-circle approximation. Real street-routing ETA is shown only when a routing provider is available.
            </div>
          </div>
        </Popup>
      </Marker>
      <Marker position={to} icon={destIcon()}>
        <Popup>
          <div className="text-xs space-y-1 min-w-[180px]">
            <div><strong>Destination</strong> {incident.resourceDestinationName ?? 'Incident'}</div>
            <div>Type: {incident.resourceDestinationType ?? 'INCIDENT'}</div>
          </div>
        </Popup>
      </Marker>
      <Polyline positions={positions} color="#3b82f6" weight={4} opacity={0.7} dashArray="6 4" />
    </MapContainer>
  )
}

export default ResourceTrackerMap
