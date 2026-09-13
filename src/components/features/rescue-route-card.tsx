'use client'
// Dynamic Rescue Route component — extends the existing Resource tracking card.
// Preserves the existing GO LIVE / NAVIGATE button (driven by setLive).
// Displays the route-status from /api/features/rescue-route. Never invents road closures.
import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { apiGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertTriangle, MapPin, Navigation, Play, Pause, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Incident, Resource } from '@/lib/types'
import { haversineKm } from '@/lib/agents/resource-agent'

const ResourceTrackerMap = dynamic(
  () => import('@/components/shared/resource-tracker-map'),
  { ssr: false, loading: () => <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">Loading map…</div> },
)

interface RouteSummary {
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
  lastEvent: { status: string | null; timestamp: string | null; details: any } | null
  generatedAt: string
}

export function RescueRouteCard({
  incident,
  resource,
  onConfirmArrival,
}: {
  incident: Incident
  resource: Resource
  onConfirmArrival?: (resourceId: string) => Promise<void>
}) {
  const [summary, setSummary] = useState<RouteSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await apiGet<RouteSummary>(`/api/features/rescue-route?incidentId=${incident.id}&resourceId=${resource.id}`)
      setSummary(r)
    } catch (e: any) {
      setError(e?.message || 'Failed to load route')
    } finally {
      setLoading(false)
    }
  }, [incident.id, resource.id])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  const effectiveIncident: Incident = summary && summary.destination
    ? {
        ...incident,
        resourceDestinationLatitude: summary.destination.lat,
        resourceDestinationLongitude: summary.destination.lng,
        resourceDestinationName: summary.destination.name,
        resourceDestinationType: summary.destination.type,
      }
    : incident

  const effectiveResource: Resource = summary && summary.currentLocation
    ? { ...resource, latitude: summary.currentLocation.lat, longitude: summary.currentLocation.lng }
    : resource

  const fallbackDistance = haversineKm(resource.latitude, resource.longitude, incident.latitude, incident.longitude)

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Navigation className="h-4 w-4 text-primary" />
          Dynamic Rescue Route
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !summary && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculating best route…
          </div>
        )}
        {error && (
          <div className="text-xs text-sev-CRITICAL flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </div>
        )}
        {summary && summary.routeStatus === 'NO_DATA' && (
          <div className="text-xs italic text-muted-foreground">DATA UNAVAILABLE — route cannot be calculated from current records.</div>
        )}
        {summary && summary.available && summary.routeStatus !== 'NO_DATA' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center text-center">
              <div className="rounded-md border-border bg-card/50 p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">CURRENT LOCATION</div>
                <div className="font-mono text-sm">{summary.currentLocation.lat.toFixed(4)}, {summary.currentLocation.lng.toFixed(4)}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Resource {summary.resourceCode}
                  {summary.currentLocation.source !== 'resource_static' && (
                    <Badge variant="outline" className="ml-1 text-[9px]">{summary.currentLocation.source}</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <ArrowDown className="h-4 w-4 text-primary" />
                <div className="font-mono text-xs">{summary.distanceKm.toFixed(2)} km · ETA ~{summary.etaMinutes} min</div>
                <Badge variant={summary.routeStatus === 'OK' ? 'secondary' : 'destructive'} className="text-[10px]">
                  {summary.routeStatus === 'OK' ? 'ROUTE OK' : '⚠ ROUTE RISK DETECTED'}
                </Badge>
              </div>
              <div className="rounded-md border-border bg-card/50 p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">DESTINATION</div>
                <div className="font-mono text-sm">{summary.destination.lat.toFixed(4)}, {summary.destination.lng.toFixed(4)}</div>
                <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <MapPin className="h-3 w-3" /> {summary.destination.name}
                </div>
              </div>
            </div>

            {summary.routeStatus === 'ROUTE_RISK_DETECTED' && (
              <div className="rounded-md border-sev-CRITICAL/40 bg-sev-CRITICAL/10 p-2.5 text-xs space-y-1">
                <div className="font-semibold text-sev-CRITICAL flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> ROUTE RISK DETECTED
                </div>
                <ul className="list-disc pl-4 text-muted-foreground">
                  {summary.risks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                {summary.alternativeRouteAvailable && (
                  <p className="text-foreground">An alternative authorized destination exists in the database — consider reassignment.</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
              <Button
                size="sm"
                variant={live ? 'default' : 'outline'}
                onClick={() => setLive((v) => !v)}
                className={cn('gap-1.5', live && 'bg-primary text-primary-foreground')}
              >
                {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {live ? 'GO LIVE' : 'GO LIVE / NAVIGATE'}
              </Button>
              <div className={cn('rounded-md border px-2.5 py-1.5 text-xs text-center', summary.routeStatus === 'OK' ? 'border-sev-LOW/30 bg-sev-LOW/10 text-sev-LOW' : 'border-sev-CRITICAL/30 bg-sev-CRITICAL/10 text-sev-CRITICAL')}>
                ROUTE STATUS: {summary.routeStatus === 'OK' ? 'OK' : 'RISK'}
              </div>
              {onConfirmArrival && (
                <Button size="sm" variant="outline" onClick={() => onConfirmArrival(resource.id)} className="gap-1.5">
                  Confirm Arrival
                </Button>
              )}
            </div>

            <div className="h-56 rounded-md overflow-hidden border-border">
              <ResourceTrackerMap
                resource={effectiveResource}
                incident={effectiveIncident}
                distanceKm={summary.distanceKm ?? fallbackDistance}
                etaMin={summary.etaMinutes}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
