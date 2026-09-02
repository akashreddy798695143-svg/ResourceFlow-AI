'use client'

import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import L from 'leaflet'

const icon = L.divIcon({
  html: `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:#f59e0b;border:2px solid white;box-shadow:0 0 0 2px rgba(0,0,0,0.4);transform:rotate(-45deg)"></div>`,
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 20],
})

export function MiniMapInner({ lat, lng, accuracy }: { lat: number; lng: number; accuracy?: number }) {
  return (
    <div className="h-40 rounded-md overflow-hidden border border-border">
      <MapContainer center={[lat, lng]} zoom={15} className="w-full h-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]} icon={icon}>
          <Popup>Your detected location</Popup>
        </Marker>
        {accuracy && accuracy > 0 && accuracy < 500 && (
          <Circle center={[lat, lng]} radius={accuracy} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.1 }} />
        )}
      </MapContainer>
    </div>
  )
}
