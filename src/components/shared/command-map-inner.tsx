'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Incident, Resource } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { IncidentTypeBadge, StatusBadge, ResourceStatusBadge } from '@/components/shared/badges'
import { MapPin, Navigation } from 'lucide-react'

const colorMap: Record<string, string> = {
  CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#22c55e',
}

const resourceStatusColors: Record<string, string> = {
  AVAILABLE: '#22c55e', ASSIGNED: '#f59e0b', EN_ROUTE: '#eab308', ON_SCENE: '#3b82f6', UNAVAILABLE: '#ef4444',
}

function resourceIcon(status: string) {
  const color = resourceStatusColors[status] || '#a3a3a3'
  return L.divIcon({
    html: `<div style="width:18px;height:18px;border-radius:3px;background:${color};border:1.5px solid white;box-shadow:0 0 0 1.5px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:bold">R</div>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function FitBounds({ incidents, resources }: { incidents: Incident[]; resources: Resource[] }) {
  const map = useMap()
  useEffect(() => {
    if (incidents.length === 0 && resources.length === 0) return
    const pts: [number, number][] = []
    incidents.forEach((i) => pts.push([i.latitude, i.longitude]))
    resources.forEach((r) => pts.push([r.latitude, r.longitude]))
    if (pts.length === 0) return
    const bounds = L.latLngBounds(pts)
    map.fitBounds(bounds.pad(0.1), { maxZoom: 14 })
  }, [incidents, resources, map])
  return null
}

export function CommandMapInner({
  incidents, resources, selectedIncident, onSelectIncident, onOpenIncident,
}: {
  incidents: Incident[]
  resources: Resource[]
  selectedIncident: string | null
  onSelectIncident: (id: string) => void
  onOpenIncident: (id: string) => void
}) {
  const center: [number, number] = [28.61, 77.21]

  return (
    <div className="w-full h-full relative map-tile-bg">
      <MapContainer
        center={center}
        zoom={12}
        className="w-full h-full"
        scrollWheelZoom
        zoomControl
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds incidents={incidents} resources={resources} />

        {incidents.map((inc) => {
          const riskColor = inc.riskLevel || 'MEDIUM'
          return (
            <CircleMarker
              key={inc.id}
              center={[inc.latitude, inc.longitude]}
              radius={8 + (inc.riskScore ? Math.round(inc.riskScore / 20) : 0)}
              pathOptions={{
                color: colorMap[riskColor] || '#a3a3a3',
                fillColor: colorMap[riskColor] || '#a3a3a3',
                fillOpacity: 0.7,
                weight: 2,
              }}
              eventHandlers={{ click: () => onSelectIncident(inc.id) }}
            >
              <Popup>
                <div className="space-y-1 min-w-[200px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-amber-600">{inc.incidentCode}</span>
                    {inc.riskLevel && <Badge variant="outline" className="text-[9px]">{inc.riskLevel} · {inc.riskScore}</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <IncidentTypeBadge type={inc.type} />
                    <StatusBadge status={inc.status} />
                  </div>
                  <p className="text-xs">{inc.description}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {inc.location}
                  </p>
                  <button
                    className="text-xs text-amber-600 hover:underline"
                    onClick={() => onOpenIncident(inc.id)}
                  >
                    Open details →
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}

        {resources.map((r) => (
          <Marker
            key={r.id}
            position={[r.latitude, r.longitude]}
            icon={resourceIcon(r.status)}
          >
            <Popup>
              <div className="space-y-1 min-w-[180px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-emerald-600">{r.resourceCode}</span>
                  <ResourceStatusBadge status={r.status} />
                </div>
                <p className="text-xs font-medium">{r.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {r.type.replace(/_/g, ' ')} · capacity {r.capacity}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="absolute bottom-3 right-3 z-[1000] rounded-md border border-border bg-card/90 backdrop-blur p-2 text-[10px] space-y-1 pointer-events-none">
        <div className="font-semibold mb-1">Legend</div>
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Critical</div>
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" /> High</div>
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-yellow-500" /> Medium</div>
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> Low / Available</div>
        <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-border">
          <Navigation className="h-2.5 w-2.5" /> Resource
        </div>
      </div>
    </div>
  )
}
