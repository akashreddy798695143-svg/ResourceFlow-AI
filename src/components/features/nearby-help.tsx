'use client'
// Citizen Nearby Help — real emergency-place finder built on the project's
// existing OSM stack (Overpass place data + OSRM routing via /api/routing +
// Leaflet maps + use-live-gps GPS hook). All place data is real OSM data;
// missing fields show "Information unavailable" instead of invented content.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  X, Navigation, Crosshair, Phone, Globe, Clock, MapPin, Search,
  Loader2, AlertTriangle, ImageOff, ExternalLink, Hospital, Flame, Shield, Pill, Home, Droplets, Ambulance, Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { apiGet } from '@/lib/api-client'
import { useLiveGps, type LivePosition } from '@/lib/use-live-gps'
import { haversineKm } from '@/lib/agents/resource-agent'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { RouteResult, RouteStep } from '@/app/api/routing/route'

interface Place {
  id: string
  name: string
  category: string
  categoryLabel: string
  lat: number
  lng: number
  address: string | null
  phone: string | null
  website: string | null
  openingHours: string | null
  emergencyCapable: boolean
  image: string | null
  distanceKm: number
}

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'hospital', label: 'Hospitals', icon: Hospital },
  { key: 'ambulance', label: 'Ambulance', icon: Ambulance },
  { key: 'police', label: 'Police', icon: Shield },
  { key: 'fire_station', label: 'Fire', icon: Flame },
  { key: 'shelter', label: 'Shelter / Safe', icon: Home },
  { key: 'pharmacy', label: 'Pharmacy', icon: Pill },
  { key: 'clinic', label: 'Clinics', icon: Hospital },
  { key: 'food_water', label: 'Food / Water', icon: Droplets },
  { key: 'government', label: 'Gov Centers', icon: Building2 },
]

const SORTS = [
  { key: 'distance', label: 'Distance' },
  { key: 'emergency', label: 'Emergency first' },
  { key: 'open', label: 'Open now (per OSM hours)' },
]

function categoryIcon(cat: string) {
  const found = CATEGORIES.find((c) => c.key === cat)
  const Icon = found?.icon ?? Building2
  return Icon
}

const youIcon = L.divIcon({
  html: `<div style="background:#2563eb;color:#fff;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);white-space:nowrap">🔵 YOU ARE HERE</div>`,
  className: '',
  iconSize: [96, 22],
  iconAnchor: [48, 11],
})

const destPin = L.divIcon({
  html: `<div style="background:#dc2626;color:#fff;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);white-space:nowrap">📍 DESTINATION</div>`,
  className: '',
  iconSize: [100, 22],
  iconAnchor: [50, 11],
})

function FollowYou({ pos, follow }: { pos: LivePosition | null; follow: boolean }) {
  const map = useMap()
  const last = useRef('')
  useEffect(() => {
    if (!pos || !follow) return
    const key = `${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}`
    if (key !== last.current) {
      last.current = key
      map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 15), { animate: true })
    }
  }, [pos, follow, map])
  return null
}

function PlaceMap({ place, myPos, route }: { place: Place | null; myPos: LivePosition | null; route: RouteResult | null }) {
  const center: [number, number] = myPos ? [myPos.lat, myPos.lng] : place ? [place.lat, place.lng] : [20.59, 78.96]
  return (
    <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {place && <Marker position={[place.lat, place.lng]} icon={destPin} />}
      {myPos && <Marker position={[myPos.lat, myPos.lng]} icon={youIcon} />}
      {route && <Polyline positions={route.geometry} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.8 }} />}
    </MapContainer>
  )
}

// ─── Citizen live navigation overlay ────────────────
function CitizenNav({ place, onClose }: { place: Place; onClose: () => void }) {
  const gps = useLiveGps()
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [offRoute, setOffRoute] = useState(false)
  const [follow, setFollow] = useState(true)
  const [recalcNotice, setRecalcNotice] = useState(false)
  const [hazards, setHazards] = useState<{ id: string; code: string; type: string; lat: number; lng: number }[] | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const lastOrigin = useRef<{ lat: number; lng: number } | null>(null)

  const recalculate = useCallback(async (from: { lat: number; lng: number }, notice: boolean) => {
    setRouteLoading(true)
    setRouteError(null)
    try {
      const r = await apiGet<RouteResult>(`/api/routing?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${place.lat}&toLng=${place.lng}`)
      setRoute(r)
      if (!r.available) setRouteError(r.reason ?? null)
      if (notice) { setRecalcNotice(true); setTimeout(() => setRecalcNotice(false), 8000) }
    } catch {
      setRouteError('Route unavailable. Please check the map and choose a safe route.')
    } finally {
      setRouteLoading(false)
    }
  }, [place.lat, place.lng])

  // Route + hazard check on first GPS fix and on significant movement (>100 m).
  useEffect(() => {
    const p = gps.position
    if (!p) return
    const origin = lastOrigin.current
    if (!origin || haversineKm(p.lat, p.lng, origin.lat, origin.lng) > 0.1) {
      lastOrigin.current = { lat: p.lat, lng: p.lng }
      void recalculate(p, !!origin)
      if (hazards == null) {
        apiGet<{ incidents?: any[]; incidentsList?: any[] }>('/api/incidents?limit=50')
          .then((r) => {
            const list = r.incidents ?? r.incidentsList ?? []
            setHazards(list.filter((i: any) => Number.isFinite(i?.latitude) && Number.isFinite(i?.longitude)).map((i: any) => ({ id: i.id, code: i.incidentCode, type: i.type, lat: i.latitude, lng: i.longitude })))
          })
          .catch(() => setHazards([]))
      }
    }
  }, [gps.position, recalculate, hazards])

  // Safer-route warning: only from real incident records near the route.
  const hazardOnRoute = useMemo(() => {
    if (!route || !hazards?.length) return null
    for (const h of hazards) {
      for (const [lat, lng] of route.geometry) {
        if (haversineKm(h.lat, h.lng, lat, lng) < 1) return h
      }
    }
    return null
  }, [route, hazards])

  const pos = gps.position
  const nextStep: RouteStep | null = useMemo(() => {
    if (!route?.steps?.length) return null
    const ref = pos ?? { lat: place.lat, lng: place.lng }
    let best: RouteStep | null = null
    let bestD = Infinity
    for (const s of route.steps) {
      const d = haversineKm(ref.lat, ref.lng, s.location[0], s.location[1])
      if (d > 0.01 && d < bestD) { bestD = d; best = s }
    }
    return best ?? route.steps[route.steps.length - 1]
  }, [route, pos, place.lat, place.lng])

  const gpsLabel = gps.status === 'LIVE' ? 'GPS: LIVE' : gps.status === 'WEAK' ? 'GPS: WEAK' : gps.status === 'PERMISSION_DENIED' ? 'PERMISSION DENIED' : gps.status === 'UNAVAILABLE' ? 'GPS UNAVAILABLE' : gps.status === 'REQUESTING' ? 'GPS: REQUESTING…' : 'GPS: OFFLINE'

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/90 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Destination</div>
          <div className="text-sm font-semibold truncate">{place.name}</div>
        </div>
        <Badge variant="outline" className={cn('ml-auto text-[10px] shrink-0', pos && gps.status === 'LIVE' ? 'border-sev-LOW/40 text-sev-LOW' : 'border-sev-CRITICAL/30 text-sev-CRITICAL')}>{gpsLabel}</Badge>
      </div>

      <div className="relative flex-1 min-h-0">
        <MapContainer center={[place.lat, place.lng]} zoom={14} className="h-full w-full" scrollWheelZoom ref={(m: L.Map | null) => { mapRef.current = m }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <Marker position={[place.lat, place.lng]} icon={destPin} />
          {pos && <Marker position={[pos.lat, pos.lng]} icon={youIcon} />}
          {route && <Polyline positions={route.geometry} pathOptions={{ color: offRoute ? '#f59e0b' : '#2563eb', weight: 5, opacity: 0.85 }} />}
          {pos && <FollowYou pos={pos} follow={follow} />}
        </MapContainer>
        <div className="absolute right-3 bottom-4 z-[1000]">
          <Button variant="outline" size="icon" className="bg-background/90 shadow" aria-label="My location"
            onClick={() => { if (!pos) return; setFollow(true); mapRef.current?.setView([pos.lat, pos.lng], 16, { animate: true }) }}>
            <Crosshair className={cn('h-4 w-4', follow && 'text-primary')} />
          </Button>
        </div>
        {routeLoading && <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-background/90 border-border rounded-full px-3 py-1 text-xs">Finding route…</div>}
        {recalcNotice && <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs shadow">Route recalculated from your current location.</div>}
        {gps.status === 'REQUESTING' && <div className="absolute inset-0 z-[900] flex items-center justify-center bg-background/70 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Requesting location permission…</div>}
      </div>

      <div className="border-t border-border bg-card/95">
        {hazardOnRoute && (
          <div className="px-4 py-2 text-xs bg-amber-500/10 border-b border-amber-500/30 text-amber-600 dark:text-amber-400">
            <div className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> POSSIBLE HAZARD ON ROUTE</div>
            <p>An affected area has been reported along/near this route ({hazardOnRoute.code} — {hazardOnRoute.type}). Verify conditions before proceeding.</p>
          </div>
        )}
        {nextStep && (
          <div className="px-4 py-2 flex items-center gap-3 border-b border-border bg-primary/5">
            <Navigation className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">{nextStep.instruction}</div>
              {nextStep.distanceMeters > 0 && <div className="text-[11px] text-muted-foreground">in {nextStep.distanceMeters >= 1000 ? `${(nextStep.distanceMeters / 1000).toFixed(1)} km` : `${nextStep.distanceMeters} m`}</div>}
            </div>
          </div>
        )}
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{place.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {route ? (route.distanceKm >= 1 ? `${route.distanceKm.toFixed(1)} km` : `${Math.round(route.distanceKm * 1000)} m`) : '—'} · {route ? `ETA ${route.durationMin} min` : 'ETA —'}{pos?.speedKph != null ? ` · ${Math.round(pos.speedKph)} km/h` : ''}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => gps.stop()} className="shrink-0">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse inline-block mr-1" /> STOP LIVE
          </Button>
        </div>
        {(gps.error || routeError) && (
          <div className="px-4 pb-3 space-y-1">
            {gps.error && <div className="rounded-md border-sev-CRITICAL/30 bg-sev-CRITICAL/10 px-3 py-2 text-xs text-sev-CRITICAL">{gps.error}<Button size="sm" variant="outline" className="ml-2 h-6 text-[11px]" onClick={() => gps.start()}>Retry</Button></div>}
            {routeError && <div className="rounded-md border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> {routeError}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Place details dialog ───────────
function PlaceDetails({ place, myPos, onClose, onNavigate, onGoLive }: {
  place: Place
  myPos: LivePosition | null
  onClose: () => void
  onNavigate: () => void
  onGoLive: () => void
}) {
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const photos = place.image ? [place.image] : []

  useEffect(() => {
    if (!myPos) return
    apiGet<RouteResult>(`/api/routing?fromLat=${myPos.lat}&fromLng=${myPos.lng}&toLat=${place.lat}&toLng=${place.lng}`)
      .then(setRoute)
      .catch(() => setRoute(null))
  }, [myPos, place.lat, place.lng])

  const distanceKm = myPos ? haversineKm(myPos.lat, myPos.lng, place.lat, place.lng) : place.distanceKm

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <div className="relative">
          {photos.length > 0 ? (
            <button className="w-full h-44 relative block" onClick={() => setGalleryIndex(0)} aria-label="View photos">
              <img src={photos[0]} alt={place.name} className="w-full h-44 object-cover" />
            </button>
          ) : (
            <div className="w-full h-44 flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
              <ImageOff className="h-6 w-6" />
              <span className="text-xs">No verified photo from the map data provider</span>
            </div>
          )}
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-background/80" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold">{place.name}</h2>
              {place.emergencyCapable && <Badge className="bg-sev-CRITICAL/15 text-sev-CRITICAL border-sev-CRITICAL text-[10px]">EMERGENCY CAPABLE</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">{place.categoryLabel} · Data © OpenStreetMap contributors</div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex items-start gap-2"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" /><span>{place.address ?? 'Information unavailable'}</span></div>
            <div className="flex items-center gap-2"><Crosshair className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span>{distanceKm >= 1 ? `${distanceKm.toFixed(1)} km away` : `${Math.round(distanceKm * 1000)} m away`}</span></div>
            <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span>{place.openingHours ? `Hours: ${place.openingHours}` : 'Opening hours: Information unavailable'}</span></div>
            {place.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><a href={`tel:${place.phone}`} className="text-primary underline">{place.phone}</a></div>}
            {place.website && <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><a href={place.website} target="_blank" rel="noopener noreferrer" className="text-primary underline flex items-center gap-1">Website <ExternalLink className="h-3 w-3" /></a></div>}
          </div>

          <div className="h-44 rounded-md overflow-hidden border-border">
            <PlaceMap place={place} myPos={myPos} route={route} />
          </div>

          {photos.length > 1 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Photos</div>
              <div className="flex gap-2 overflow-x-auto">
                {photos.map((src, i) => (
                  <img key={i} src={src} alt={`${place.name} photo ${i + 1}`} className="h-16 w-24 object-cover rounded-md cursor-pointer border-border" onClick={() => setGalleryIndex(i)} />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Button size="sm" className="gap-1.5" onClick={onNavigate}><Navigation className="h-3.5 w-3.5" /> GET DIRECTIONS</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onGoLive}>GO LIVE</Button>
            {place.phone && (
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <a href={`tel:${place.phone}`}><Phone className="h-3.5 w-3.5" /> CALL</a>
              </Button>
            )}
          </div>
        </div>

        {galleryIndex != null && (
          <div className="fixed inset-0 z-[10001] bg-black/90 flex items-center justify-center" onClick={() => setGalleryIndex(null)}>
            <img src={photos[galleryIndex]} alt={place.name} className="max-h-[85vh] max-w-[95vw] object-contain" />
            <Button variant="ghost" size="icon" className="absolute top-3 right-3 text-white" aria-label="Close photo"><X className="h-5 w-5" /></Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Main NearbyHelp section ────────────────
export function NearbyHelpSection({ big }: { big?: boolean }) {
  const [locState, setLocState] = useState<'idle' | 'locating' | 'denied' | 'ready'>('idle')
  const [ref, setRef] = useState<{ lat: number; lng: number } | null>(null)
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('distance')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Place | null>(null)
  const [navPlace, setNavPlace] = useState<Place | null>(null)

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocState('denied')
      return
    }
    setLocState('locating')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setRef({ lat: p.coords.latitude, lng: p.coords.longitude })
        setLocState('ready')
      },
      () => setLocState('denied'),
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }, [])

  useEffect(() => { locate() }, [locate])

  useEffect(() => {
    if (!ref) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    apiGet<{ places: Place[]; unavailable?: boolean; message?: string }>(`/api/places/nearby?lat=${ref.lat}&lng=${ref.lng}&category=${category}&radius=6000`)
      .then((r) => {
        if (cancelled) return
        if (r.unavailable) { setLoadError(r.message ?? 'Place search is temporarily unavailable.'); setPlaces([]) }
        else setPlaces(r.places)
      })
      .catch((e) => { if (!cancelled) { setLoadError(e?.message || 'Failed to find nearby places.'); setPlaces([]) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ref, category])

  const visible = useMemo(() => {
    if (!places) return []
    let list = places
    if (search.trim() !== '') {
      const q = search.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.address ?? '').toLowerCase().includes(q))
    }
    if (sort === 'emergency') list = [...list].sort((a, b) => (b.emergencyCapable ? 1 : 0) - (a.emergencyCapable ? 1 : 0) || a.distanceKm - b.distanceKm)
    else if (sort === 'open') list = [...list].sort((a, b) => (a.openingHours ? 0 : 1) - (b.openingHours ? 0 : 1) || a.distanceKm - b.distanceKm)
    else list = [...list].sort((a, b) => a.distanceKm - b.distanceKm)
    return list
  }, [places, search, sort])

  const openDirections = (p: Place) => { setSelected(null); setNavPlace(p) }
  const openGoLive = (p: Place) => { setSelected(null); setNavPlace(p) }

  return (
    <div className="space-y-3">
      {locState === 'idle' || locState === 'locating' ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Finding nearby emergency services…
        </CardContent></Card>
      ) : locState === 'denied' ? (
        <Card><CardContent className="p-6 space-y-3 text-center">
          <p className="text-sm">Your location is unavailable. Enable location access to find nearby services.</p>
          <div className="flex justify-center gap-2">
            <Button size="sm" onClick={locate}>TRY AGAIN</Button>
          </div>
        </CardContent></Card>
      ) : (
        <>
          {/* Filters */}
          <div className="space-y-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1 rf-scroll">
              {CATEGORIES.map((c) => (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className={cn('shrink-0 rounded-full border px-3 py-1 text-xs', category === c.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card')}>
                  {c.icon && <c.icon className="h-3 w-3 inline mr-1" />}{c.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or address" className="pl-8 h-9 text-xs" />
              </div>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SORTS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading && (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Finding nearby emergency services…
            </CardContent></Card>
          )}
          {loadError && !loading && (
            <Card><CardContent className="p-4 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {loadError}</CardContent></Card>
          )}
          {places != null && !loading && visible.length === 0 && !loadError && (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No nearby emergency services found.</CardContent></Card>
          )}

          {/* Cards */}
          <div className={cn('grid gap-3', big ? 'md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1')}>
            {visible.map((p) => {
              const Icon = categoryIcon(p.category)
              return (
                <Card key={p.id} className="overflow-hidden">
                  <div className="h-28 bg-muted relative">
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="w-full h-28 object-cover" />
                    ) : (
                      <div className="w-full h-28 flex-col items-center justify-center gap-1 text-muted-foreground">
                        <Icon className="h-6 w-6" /><span className="text-[10px]">No provider photo available</span>
                      </div>
                    )}
                    {p.emergencyCapable && <Badge className="absolute top-2 left-2 bg-sev-CRITICAL/90 text-white text-[9px] border-0">EMERGENCY</Badge>}
                  </div>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">{p.categoryLabel}</div>
                      </div>
                      <div className="text-xs font-mono shrink-0">{p.distanceKm >= 1 ? `${p.distanceKm.toFixed(1)} km` : `${Math.round(p.distanceKm * 1000)} m`}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <div className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{p.address ?? 'Address: Information unavailable'}</div>
                      {p.openingHours && <div className="flex items-center gap-1"><Clock className="h-3 w-3 shrink-0" />{p.openingHours}</div>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setSelected(p)}>VIEW DETAILS</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openDirections(p)}><Navigation className="h-3 w-3 mr-1" />GET DIRECTIONS</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openGoLive(p)}>GO LIVE</Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <p className="text-[10px] text-muted-foreground text-center">Place data © OpenStreetMap contributors. Photos shown only when published by the map data provider.</p>
        </>
      )}

      {selected && (
        <PlaceDetails
          place={selected}
          myPos={ref ? { lat: ref.lat, lng: ref.lng, accuracy: null, speedKph: null, heading: null, timestamp: Date.now() } : null}
          onClose={() => setSelected(null)}
          onNavigate={() => openDirections(selected)}
          onGoLive={() => openGoLive(selected)}
        />
      )}
      {navPlace && <CitizenNav place={navPlace} onClose={() => setNavPlace(null)} />}
    </div>
  )
}

export default NearbyHelpSection
