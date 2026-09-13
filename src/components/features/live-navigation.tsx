'use client'
// Real GPS navigation screen for responders (Go Live).
// Uses actual browser GPS (navigator.geolocation.watchPosition), OSRM route via
// /api/routing, existing ResourceDestination/Incident data, and the existing
// arrival-confirmation API. No simulated movement anywhere.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { X, Navigation, Crosshair, CheckCircle2, AlertTriangle, Info, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiGet, apiPost } from '@/lib/api-client'
import { useLiveGps, type LivePosition } from '@/lib/use-live-gps'
import { haversineKm } from '@/lib/agents/resource-agent'
import { cn } from '@/lib/utils'
import type { Incident, Resource } from '@/lib/types'
import type { RouteResult, RouteStep } from '@/app/api/routing/route'

const SatelliteTileLayer = () => (
  <>
    <TileLayer
      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      attribution="Tiles &copy; Esri"
    />
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" opacity={0.35} attribution="" />
  </>
)

function liveIcon(weak: boolean) {
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;gap:3px;background:${weak ? '#f59e0b' : '#2563eb'};color:#fff;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);white-space:nowrap;transition:transform .6s ease">🔵 LIVE</div>`,
    className: '',
    iconSize: [58, 22],
    iconAnchor: [29, 11],
  })
}

function destIcon() {
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;gap:3px;background:#dc2626;color:#fff;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);white-space:nowrap">📍 INCIDENT</div>`,
    className: '',
    iconSize: [74, 22],
    iconAnchor: [37, 11],
  })
}

// Keeps the map centered on the responder while navigating (user can pan away freely).
function FollowResponder({ pos, follow }: { pos: LivePosition | null; follow: boolean }) {
  const map = useMap()
  const lastRef = useRef<string>('')
  useEffect(() => {
    if (!pos || !follow) return
    const key = `${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}`
    if (key === lastRef.current) return
    lastRef.current = key
    map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 15), { animate: true })
  }, [pos, follow, map])
  return null
}

function fitRoute(map: L.Map, geometry: [number, number][]) {
  if (geometry.length < 2) return
  map.fitBounds(L.latLngBounds(geometry).pad(0.2), { animate: true })
}

function RouteFit({ geometry }: { geometry: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    fitRoute(map, geometry)
  }, [map, geometry])
  return null
}

const ARRIVAL_RADIUS_M = 75

export function LiveNavigation({
  incident,
  resource,
  onClose,
  onConfirmArrival,
  officerMode,
}: {
  incident: Incident
  resource: Resource
  onClose: () => void
  onConfirmArrival?: (resourceId: string) => Promise<void>
  officerMode?: boolean
}) {
  const destLat = incident.resourceDestinationLatitude ?? incident.latitude
  const destLng = incident.resourceDestinationLongitude ?? incident.longitude

  const [route, setRoute] = useState<RouteResult | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [offRoute, setOffRoute] = useState(false)
  const [arrived, setArrived] = useState(resource.status === 'ARRIVED')
  const [confirming, setConfirming] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [follow, setFollow] = useState(true)
  const [satellite, setSatellite] = useState(false)
  const [arrivedNear, setArrivedNear] = useState(false)
  const [lastRecalcAt, setLastRecalcAt] = useState<number | null>(null)
  const [officerPos, setOfficerPos] = useState<LivePosition | null>(null)
  const mapRef = useRef<L.Map | null>(null)

  const onPositionRef = useRef<((p: LivePosition) => void) | null>(null)
  const gps = useLiveGps(useCallback((p: LivePosition) => onPositionRef.current?.(p), []))

  const recalculate = useCallback(
    async (from: { lat: number; lng: number }, showRecalcNotice: boolean) => {
      setRouteLoading(true)
      setRouteError(null)
      try {
        const r = await apiGet<RouteResult>(
          `/api/routing?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${destLat}&toLng=${destLng}`
        )
        setRoute(r)
        if (showRecalcNotice) setLastRecalcAt(Date.now())
        if (!r.available) setRouteError(r.reason ?? null)
      } catch (e: any) {
        setRouteError('Route unavailable. Please check the map and choose a safe route.')
      } finally {
        setRouteLoading(false)
      }
    },
    [destLat, destLng]
  )

  const isOffRoute = useCallback(
    (p: LivePosition, r: RouteResult): boolean => {
      if (!r.available || r.geometry.length < 2) return false
      // Distance from current point to nearest route vertex (cheap but honest).
      let best = Infinity
      for (const [lat, lng] of r.geometry) {
        const d = haversineKm(p.lat, p.lng, lat, lng)
        if (d < best) best = d
        if (d < 0.03) return false // within 30 m of a vertex
      }
      return best > 0.08 // more than 80 m from the whole route line
    },
    []
  )

  // Handle each real GPS fix
  const onPosition = useCallback(
    (p: LivePosition) => {
      const distanceKm = haversineKm(p.lat, p.lng, destLat, destLng)
      setArrivedNear(distanceKm * 1000 <= ARRIVAL_RADIUS_M)
      setRoute((prev) => {
        if (prev && isOffRoute(p, prev)) {
          setOffRoute(true)
          void recalculate(p, true)
          return prev
        }
        setOffRoute(false)
        // Significant movement → update remaining distance/ETA honestly from provider geometry.
        return prev
      })
      if (!route) void recalculate(p, false)
    },
    [destLat, destLng, isOffRoute, recalculate, route]
  )
  useEffect(() => {
    onPositionRef.current = onPosition
  }, [onPosition])

  // Recalculate route when GPS position meaningfully changes (moved > ~100m from last route origin).
  const lastRouteOrigin = useRef<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    const p = gps.position
    if (!p) return
    const origin = lastRouteOrigin.current
    if (!origin || haversineKm(p.lat, p.lng, origin.lat, origin.lng) > 0.1) {
      lastRouteOrigin.current = { lat: p.lat, lng: p.lng }
      void recalculate(p, !!origin)
    }
  }, [gps.position?.lat, gps.position?.lng])

  // Officer/admin live view: poll authorized latest responder location.
  useEffect(() => {
    if (!officerMode) return
    let cancelled = false
    const pull = async () => {
      try {
        const r = await apiGet<{ updates: { latitude: number; longitude: number; accuracy: number | null; speedKph: number | null; timestamp: string }[] }>(
          `/api/resources/location?resourceId=${resource.id}&incidentId=${incident.id}&sinceMinutes=60`
        )
        const latest = r.updates?.[0]
        if (!cancelled && latest) {
          setOfficerPos({ lat: latest.latitude, lng: latest.longitude, accuracy: latest.accuracy, speedKph: latest.speedKph, heading: null, timestamp: new Date(latest.timestamp).getTime() })
        }
      } catch {
        // Not authorized or none yet — show last known DB location only.
      }
    }
    pull()
    const id = setInterval(pull, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [officerMode, resource.id, incident.id])

  const startLive = useCallback(() => {
    gps.start({ resourceId: resource.id, incidentId: incident.id })
  }, [gps, resource.id, incident.id])

  const stopLive = useCallback(() => {
    gps.stop()
  }, [gps])

  useEffect(() => () => stopLive(), [stopLive])

  // Initial route from the resource's last known location (before first GPS fix).
  useEffect(() => {
    if (officerMode) return
    if (!gps.position && !route && !routeLoading) {
      void recalculate({ lat: resource.latitude, lng: resource.longitude }, false)
    }
  }, [officerMode])

  const pos = officerMode ? officerPos : gps.position
  const current = pos ? { lat: pos.lat, lng: pos.lng } : { lat: resource.latitude, lng: resource.longitude }

  // Next instruction: nearest upcoming step from actual provider data.
  const nextStep: RouteStep | null = useMemo(() => {
    if (!route?.steps?.length) return null
    let best: RouteStep | null = null
    let bestD = Infinity
    for (const s of route.steps) {
      const d = haversineKm(current.lat, current.lng, s.location[0], s.location[1])
      if (d > 0.01 && d < bestD) {
        bestD = d
        best = s
      }
    }
    return best ?? route.steps[route.steps.length - 1]
  }, [route, current.lat, current.lng])

  const remainingKm = route ? route.distanceKm : haversineKm(current.lat, current.lng, destLat, destLng)
  const etaMin = route ? route.durationMin : null
  const arrivedState = arrived

  const handleConfirmArrival = async () => {
    setConfirming(true)
    try {
      if (onConfirmArrival) await onConfirmArrival(resource.id)
      await apiPost(`/api/incident/${incident.id}/arrival-confirmation`, {
        resourceId: resource.id,
        mode: 'manual',
        latitude: current.lat,
        longitude: current.lng,
      })
      setArrived(true)
      stopLive()
    } catch {
      // surfaced by parent toasts
    } finally {
      setConfirming(false)
    }
  }

  const gpsLabel = officerMode
    ? officerPos ? 'GPS LIVE' : 'NO GPS YET'
    : gps.status === 'LIVE' ? 'GPS LIVE' : gps.status === 'WEAK' ? 'GPS WEAK' : gps.status === 'PERMISSION_DENIED' ? 'PERMISSION DENIED' : gps.status === 'UNAVAILABLE' ? 'GPS UNAVAILABLE' : gps.status === 'REQUESTING' ? 'REQUESTING…' : 'OFFLINE'

  const gpsTone =
    gps.status === 'LIVE' ? 'bg-sev-LOW/15 text-sev-LOW border-sev-LOW/30' : gps.status === 'REQUESTING' ? 'bg-muted text-muted-foreground' : 'bg-sev-CRITICAL/10 text-sev-CRITICAL border-sev-CRITICAL/30'

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/90 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close navigation"><X className="h-4 w-4" /></Button>
        <div className="min-w-0">
          <div className="text-xs font-mono text-primary">{incident.incidentCode}</div>
          <div className="text-sm font-semibold truncate">{incident.resourceDestinationName ?? incident.location}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {officerMode && officerPos && <Badge variant="outline" className="text-[10px] border-sev-LOW/40 text-sev-LOW">RESPONDER LIVE</Badge>}
          {officerMode && <Badge variant="outline" className="text-[10px]">{resource.status === 'ARRIVED' ? 'ARRIVED' : 'EN ROUTE'}</Badge>}
          <Badge variant="outline" className={cn('text-[10px]', gpsTone)}>{gpsLabel}</Badge>
          {gps.syncStatus === 'OFFLINE' && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">OFFLINE</Badge>}
          {gps.syncStatus === 'SYNCING' && <Badge variant="outline" className="text-[10px]">SYNCING…</Badge>}
          <Button variant={satellite ? 'default' : 'ghost'} size="icon" onClick={() => setSatellite((s) => !s)} aria-label="Toggle satellite"><Info className="hidden" /><span className="text-[10px] font-bold">{satellite ? 'SAT' : 'MAP'}</span></Button>
        </div>
      </div>

      {/* Map fills the screen (mobile-first) */}
      <div className="relative flex-1 min-h-0">
        <MapContainer
          center={[current.lat, current.lng]}
          zoom={14}
          className="h-full w-full"
          scrollWheelZoom
          ref={(m: L.Map | null) => { mapRef.current = m }}
        >
          {satellite ? <SatelliteTileLayer /> : (
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
          )}
          {route && <Polyline positions={route.geometry} pathOptions={{ color: offRoute ? '#f59e0b' : '#2563eb', weight: 5, opacity: 0.8 }} />}
          {route && <Polyline positions={route.geometry} pathOptions={{ color: '#ffffff', weight: 1.5, opacity: 0.5 }} />}
          <Marker position={[destLat, destLng]} icon={destIcon()} />
          {pos && <Marker position={[pos.lat, pos.lng]} icon={liveIcon(gps.status === 'WEAK')} />}
          {!officerMode && <FollowResponder pos={pos} follow={follow} />}
          {route?.geometry && route.geometry.length > 1 && <RouteFit geometry={route.geometry} />}
        </MapContainer>

        {/* Recenter control */}
        <div className="absolute right-3 bottom-4 z-[1000] flex flex-col gap-2">
          <Button
            variant="outline"
            size="icon"
            className="bg-background/90 shadow"
            aria-label="My location"
            onClick={() => {
              if (!pos) return
              setFollow(true)
              mapRef.current?.setView([pos.lat, pos.lng], 16, { animate: true })
            }}
          >
            <Crosshair className={cn('h-4 w-4', follow && 'text-primary')} />
          </Button>
        </div>

        {routeLoading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-background/90 border border-border rounded-full px-3 py-1 text-xs">
            Calculating route…
          </div>
        )}
        {lastRecalcAt && Date.now() - lastRecalcAt < 8000 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs shadow">
            Route recalculated from your current location.
          </div>
        )}
      </div>

      {/* Bottom navigation panel (compact, mobile-first) */}
      <div className="border-t border-border bg-card/95 backdrop-blur">
        {/* Current instruction */}
        {nextStep && !arrivedState && gps.status !== 'IDLE' && (
          <div className="px-4 py-2.5 flex items-center gap-3 border-b border-border bg-primary/5">
            <Navigation className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">{nextStep.instruction}</div>
              {nextStep.distanceMeters > 0 && (
                <div className="text-[11px] text-muted-foreground">in {nextStep.distanceMeters >= 1000 ? `${(nextStep.distanceMeters / 1000).toFixed(1)} km` : `${nextStep.distanceMeters} m`}</div>
              )}
            </div>
          </div>
        )}

        <button className="w-full px-4 py-2.5 text-left" onClick={() => setShowDetails((s) => !s)}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Destination</div>
              <div className="text-sm font-semibold truncate">{incident.resourceDestinationName ?? incident.location}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-bold leading-none tabular-nums">{remainingKm != null ? (remainingKm >= 1 ? `${remainingKm.toFixed(1)} km` : `${Math.round(remainingKm * 1000)} m`) : '—'}</div>
              <div className="text-[11px] text-muted-foreground">{etaMin != null ? `ETA ${etaMin} min` : ''}{pos?.speedKph != null ? ` · ${Math.round(pos.speedKph)} km/h` : ''}</div>
            </div>
            {showDetails ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>

        {showDetails && (
          <div className="px-4 pb-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border p-2"><div className="text-[10px] uppercase text-muted-foreground">Incident Type</div>{incident.type}</div>
            <div className="rounded-md border border-border p-2"><div className="text-[10px] uppercase text-muted-foreground">Severity</div>{incident.aiSeverity ?? incident.riskLevel ?? '—'}</div>
            <div className="rounded-md border border-border p-2"><div className="text-[10px] uppercase text-muted-foreground">People Affected</div>{incident.aiPeopleAffected ?? '—'}</div>
            <div className="rounded-md border border-border p-2"><div className="text-[10px] uppercase text-muted-foreground">Urgent Needs</div>{incident.aiUrgentNeeds ? String(incident.aiUrgentNeeds).replace(/[\[\]"]/g, '') : '—'}</div>
            <div className="col-span-2 rounded-md border border-border p-2"><div className="text-[10px] uppercase text-muted-foreground">AI Analysis Summary</div>{incident.aiRiskFactors ? String(incident.aiRiskFactors).replace(/[\[\]"]/g, '') : 'No AI analysis available.'}</div>
            <div className="col-span-2 rounded-md border border-border p-2"><div className="text-[10px] uppercase text-muted-foreground">Emergency Contact</div>{incident.citizenPhone ? <a className="text-primary underline" href={`tel:${incident.citizenPhone}`}>{incident.citizenPhone}</a> : '—'}</div>
          </div>
        )}

        {/* Status / warnings */}
        <div className="px-4 space-y-2 pb-3">
          {arrivedNear && !arrivedState && (
            <div className="rounded-md border border-sev-LOW/30 bg-sev-LOW/10 px-3 py-2 text-xs text-sev-LOW flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Near destination — confirm arrival to record it.
            </div>
          )}
          {offRoute && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> OFF ROUTE — recalculating from your current location…
            </div>
          )}
          {gps.error && (
            <div className="rounded-md border border-sev-CRITICAL/30 bg-sev-CRITICAL/10 px-3 py-2 text-xs text-sev-CRITICAL">
              {gps.error}
              {gps.status === 'PERMISSION_DENIED' && (
                <Button size="sm" variant="outline" className="ml-2 h-6 text-[11px]" onClick={startLive}>Retry</Button>
              )}
            </div>
          )}
          {routeError && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> {routeError}
            </div>
          )}
          {pos?.accuracy != null && (
            <div className="text-[10px] text-muted-foreground">
              GPS Accuracy: ±{Math.round(pos.accuracy)} m {pos.accuracy > 100 && <span className="text-amber-500 font-semibold">GPS ACCURACY LOW</span>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!officerMode && (
              gps.status === 'IDLE' || gps.status === 'PERMISSION_DENIED' || gps.status === 'UNAVAILABLE' ? (
                <Button size="sm" onClick={startLive} className="gap-1.5">
                  <Navigation className="h-3.5 w-3.5" /> {gps.status === 'IDLE' ? 'GO LIVE' : 'RETRY GO LIVE'}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={stopLive} className="gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse inline-block" /> STOP LIVE
                </Button>
              )
            )}
            {!officerMode && !arrivedState && (
              <Button size="sm" className="bg-sev-LOW text-foreground hover:bg-sev-LOW/80 gap-1.5 ml-auto" onClick={handleConfirmArrival} disabled={confirming}>
                <CheckCircle2 className="h-3.5 w-3.5" /> {confirming ? 'CONFIRMING…' : 'CONFIRM ARRIVAL'}
              </Button>
            )}
            {arrivedState && (
              <div className="text-xs font-semibold text-sev-LOW flex items-center gap-1.5 ml-auto">
                <CheckCircle2 className="h-4 w-4" /> ARRIVED
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LiveNavigation
