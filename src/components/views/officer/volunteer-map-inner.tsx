'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { VolunteerRegistration } from '@/lib/types'

function FitBounds({ volunteers }: { volunteers: VolunteerRegistration[] }) {
  const map = useMap()
  useEffect(() => {
    const pts = volunteers.filter((v) => v.latitude && v.longitude).map((v) => [v.latitude!, v.longitude!] as [number, number])
    if (pts.length === 0) return
    map.fitBounds(L.latLngBounds(pts).pad(0.1), { maxZoom: 14 })
  }, [volunteers, map])
  return null
}

export function VolunteerMapInner({ volunteers }: { volunteers: VolunteerRegistration[] }) {
  const withLocation = volunteers.filter((v) => v.latitude != null && v.longitude != null)

  return (
    <div className="rounded-lg overflow-hidden border border-border h-[500px]">
      <MapContainer center={[20.5937, 78.9629]} zoom={4} className="h-full w-full" scrollWheelZoom>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        <FitBounds volunteers={withLocation} />
        {withLocation.map((v) => {
          const color = v.availability === 'AVAILABLE' ? '#22c55e' : v.availability === 'BUSY' ? '#f59e0b' : '#6b7280'
          return (
            <CircleMarker key={v.id} center={[v.latitude as number, v.longitude as number]} radius={8} pathOptions={{ color, fillColor: color, fillOpacity: 0.7, weight: 2 }}>
              <Popup>
                <div className="space-y-1 min-w-[180px]">
                  <p className="font-medium text-sm">{v.name}</p>
                  <p className="text-xs text-muted-foreground">Skills: {v.skills}</p>
                  <p className="text-xs">Status: <span style={{ color }}>{v.availability}</span> · {v.status}</p>
                  <p className="text-xs text-muted-foreground">Phone: {v.phone || 'N/A'}</p>
                  {v.locationTimestamp && <p className="text-[10px] text-muted-foreground">Updated: {new Date(v.locationTimestamp).toLocaleString()}</p>}
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}