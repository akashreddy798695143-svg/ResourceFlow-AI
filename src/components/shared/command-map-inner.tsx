'use client'

import { Fragment, useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Incident, Resource } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { IncidentTypeBadge, StatusBadge, ResourceStatusBadge } from '@/components/shared/badges'
import { MapPin, Navigation, Maximize2, Minimize2, Layers, Crosshair } from 'lucide-react'
import { cn } from '@/lib/utils'

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

// Pulsing marker for critical incidents (animated CSS ring)
function criticalIcon(color: string, radius: number) {
  return L.divIcon({
    html: `<div style="position:relative;width:${radius * 2}px;height:${radius * 2}px"><div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.3;animation:rfpulse 2s ease-out infinite"></div><div style="position:absolute;inset:25%;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 0 1.5px rgba(0,0,0,0.4)"></div></div>`,
    className: '',
    iconSize: [radius * 2, radius * 2],
    iconAnchor: [radius, radius],
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

// Re-center on selected incident
function Recenter({ selectedId, incidents }: { selectedId: string | null; incidents: Incident[] }) {
  const map = useMap()
  useEffect(() => {
    if (!selectedId) return
    const inc = incidents.find((i) => i.id === selectedId)
    if (inc) map.flyTo([inc.latitude, inc.longitude], Math.max(map.getZoom(), 13), { duration: 0.8 })
  }, [selectedId, incidents, map])
  return null
}

const LAYERS = [
  { id: 'street', label: 'Street', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
  { id: 'satellite', label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri' },
  { id: 'terrain', label: 'Terrain', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenTopoMap (CC-BY-SA)' },
]

export function CommandMapInner({
  incidents, resources, selectedIncident, onSelectIncident, onOpenIncident, fullscreen, onToggleFullscreen,
}: {
  incidents: Incident[]
  resources: Resource[]
  selectedIncident: string | null
  onSelectIncident: (id: string) => void
  onOpenIncident: (id: string) => void
  fullscreen?: boolean
  onToggleFullscreen?: () => void
}) {
  const [layer, setLayer] = useState('street')
  const [showLayers, setShowLayers] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const center: [number, number] = [28.61, 77.21]

  const activeLayer = LAYERS.find((l) => l.id === layer) || LAYERS[0]

  return (
    <div className={cn('w-full h-full relative map-tile-bg', fullscreen && 'fixed inset-0 z-[9999]')}>
      <MapContainer
        center={center}
        zoom={12}
        className={cn('w-full h-full', fullscreen && 'h-screen')}
        scrollWheelZoom
        zoomControl
      >
        <TileLayer
          key={layer}
          attribution={activeLayer.attribution}
          url={activeLayer.url}
        />
        <FitBounds incidents={incidents} resources={resources} />
        <Recenter selectedId={selectedIncident} incidents={incidents} />

        {incidents.map((inc) => {
          const riskColor = inc.riskLevel || 'MEDIUM'
          const radius = 8 + (inc.riskScore ? Math.round(inc.riskScore / 20) : 0)
          const isCritical = inc.riskLevel === 'CRITICAL' || inc.status === 'ESCALATED'
          return isCritical ? (
            <Fragment key={inc.id}>
              {showHeatmap && <CircleMarker center={[inc.latitude, inc.longitude]} radius={Math.max(24, radius * 3)} pathOptions={{ color: colorMap[riskColor] || '#a3a3a3', fillColor: colorMap[riskColor] || '#a3a3a3', fillOpacity: 0.12, weight: 1 }} />}
              <Marker position={[inc.latitude, inc.longitude]} icon={criticalIcon(colorMap[riskColor] || '#a3a3a3', radius)} eventHandlers={{ click: () => onSelectIncident(inc.id) }}>
                <Popup><IncidentPopup inc={inc} onOpen={onOpenIncident} /></Popup>
              </Marker>
            </Fragment>
          ) : (
            <Fragment key={inc.id}>
              {showHeatmap && <CircleMarker center={[inc.latitude, inc.longitude]} radius={Math.max(22, radius * 2.5)} pathOptions={{ color: colorMap[riskColor] || '#a3a3a3', fillColor: colorMap[riskColor] || '#a3a3a3', fillOpacity: 0.1, weight: 1 }} />}
              <CircleMarker center={[inc.latitude, inc.longitude]} radius={radius} pathOptions={{ color: colorMap[riskColor] || '#a3a3a3', fillColor: colorMap[riskColor] || '#a3a3a3', fillOpacity: 0.7, weight: 2 }} eventHandlers={{ click: () => onSelectIncident(inc.id) }}>
                <Popup><IncidentPopup inc={inc} onOpen={onOpenIncident} /></Popup>
              </CircleMarker>
            </Fragment>
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

      {/* Full-screen toggle */}
      {onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          className="absolute top-3 right-3 z-[1000] rounded-md border border-border bg-card/90 backdrop-blur p-2 text-xs hover:bg-accent/40 transition flex items-center gap-1.5"
          title={fullscreen ? 'Exit full screen' : 'View full screen'}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          {fullscreen ? 'Exit' : 'Full Screen'}
        </button>
      )}

      {/* Layer selector */}
      <div className="absolute top-3 left-3 z-[1000]">
        <button
          onClick={() => setShowLayers(!showLayers)}
          className="rounded-md border border-border bg-card/90 backdrop-blur p-2 text-xs hover:bg-accent/40 transition flex items-center gap-1.5"
        >
          <Layers className="h-4 w-4" /> {activeLayer.label}
        </button>
        {showLayers && (
          <div className="mt-1 rounded-md border border-border bg-card/95 backdrop-blur p-1 space-y-0.5">
            {LAYERS.map((l) => (
              <button
                key={l.id}
                onClick={() => { setLayer(l.id); setShowLayers(false) }}
                className={cn('block w-full text-left px-2 py-1 rounded text-xs hover:bg-accent/40 transition', layer === l.id && 'bg-primary/15 text-primary font-medium')}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => setShowHeatmap((visible) => !visible)}
        className={cn('absolute top-14 left-3 z-[1000] rounded-md border border-border bg-card/90 backdrop-blur p-2 text-xs hover:bg-accent/40 transition flex items-center gap-1.5', showHeatmap && 'text-primary border-primary/50')}
        title="Toggle risk heatmap"
      >
        <Crosshair className="h-4 w-4" /> {showHeatmap ? 'Heatmap on' : 'Heatmap off'}
      </button>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] rounded-md border border-border bg-card/90 backdrop-blur p-2 text-[10px] space-y-1 pointer-events-none">
        <div className="font-semibold mb-1">Legend</div>
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> Critical (pulsing)</div>
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" /> High</div>
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-yellow-500" /> Medium</div>
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> Low / Available</div>
        <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-border">
          <Navigation className="h-2.5 w-2.5" /> Resource
        </div>
      </div>

      {/* Pulse animation CSS (injected once) */}
      <style dangerouslySetInnerHTML={{ __html: `@keyframes rfpulse{0%{transform:scale(1);opacity:0.3}100%{transform:scale(2.5);opacity:0}}` }} />
    </div>
  )
}

function IncidentPopup({ inc, onOpen }: { inc: Incident; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-1 min-w-[220px]">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-amber-600">{inc.incidentCode}</span>
        {inc.riskLevel && <Badge variant="outline" className="text-[9px]">{inc.riskLevel} · {inc.riskScore}</Badge>}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <IncidentTypeBadge type={inc.type} />
        <StatusBadge status={inc.status} />
        {inc.escalationLevel > 0 && <Badge variant="outline" className="text-[9px] text-red-500 border-red-500">L{inc.escalationLevel}</Badge>}
      </div>
      <p className="text-xs line-clamp-2">{inc.description}</p>
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <MapPin className="h-3 w-3" /> {inc.location}
      </p>
      {inc.citizenName && <p className="text-[10px] text-muted-foreground">Citizen: {inc.citizenName}</p>}
      <button
        className="text-xs text-amber-600 hover:underline font-medium"
        onClick={() => onOpen(inc.id)}
      >
        Open details →
      </button>
    </div>
  )
}
