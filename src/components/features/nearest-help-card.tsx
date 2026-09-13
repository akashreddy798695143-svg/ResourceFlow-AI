'use client'
// Nearest Help Match component. Used by citizen dashboard and shared via chatbot.
// Reads /api/features/nearest-help with the user's authorized location.
import { useEffect, useState, useCallback } from 'react'
import { apiGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, MapPin, Crosshair, Shield, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NearbyHelpItem {
  kind: 'medical' | 'rescue' | 'shelter' | 'safe' | 'resource'
  name: string
  category: string
  status: string
  distanceKm: number
  estimatedMinutes: number | null
  lat: number
  lng: number
  address: string | null
  phone: string | null
  source: string
  notes: string | null
}

interface NearestHelpResponse {
  available: boolean
  dataUnavailableReason?: string
  reference: { lat: number; lng: number }
  items: NearbyHelpItem[]
  groups: Array<{ kind: string; label: string; icon: string; items: NearbyHelpItem[] }>
  generatedAt: string
}

const KIND_FILTERS = [
  { value: 'all', label: 'All Help' },
  { value: 'medical', label: 'Medical' },
  { value: 'rescue', label: 'Rescue' },
  { value: 'shelter', label: 'Shelter' },
  { value: 'safe', label: 'Safe Place' },
] as const

export function NearestHelpCard({ incidentId, defaultKind = 'all' }: { incidentId?: string; defaultKind?: string }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [data, setData] = useState<NearestHelpResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<string>(defaultKind)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'requesting' | 'success' | 'denied' | 'error'>('idle')

  const requestGps = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('error')
      return
    }
    setGpsStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsStatus('success')
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  }, [])

  const load = useCallback(async (lat: number, lng: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng), kind: kind })
      if (incidentId) params.set('incidentId', incidentId)
      const r = await apiGet<NearestHelpResponse>(`/api/features/nearest-help?${params.toString()}`)
      setData(r)
    } catch (e: any) {
      setError(e?.message || 'Failed to load nearest help')
    } finally {
      setLoading(false)
    }
  }, [kind, incidentId])

  useEffect(() => {
    if (!coords) requestGps()
  }, [coords, requestGps])

  useEffect(() => {
    if (coords) load(coords.lat, coords.lng)
  }, [coords, load])

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Nearest Available Help
            </CardTitle>
            <CardDescription className="text-xs">
              Ranks help by relevance, availability, distance, and incident priority.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => coords && load(coords.lat, coords.lng)} disabled={loading || !coords}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={requestGps} disabled={gpsStatus === 'requesting'}>
              {gpsStatus === 'requesting' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
              Re-detect GPS
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setKind(f.value)}
              className={cn(
                'text-[11px] px-2.5 py-1 rounded-md border font-medium transition',
                kind === f.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:bg-muted',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {gpsStatus !== 'success' && (
          <div className="rounded-md border-sev-MEDIUM/40 bg-sev-MEDIUM/10 p-2 text-xs">
            {gpsStatus === 'requesting' && <span><Loader2 className="h-3 w-3 inline animate-spin mr-1" /> Detecting your location…</span>}
            {(gpsStatus === 'denied' || gpsStatus === 'error' || gpsStatus === 'idle') && (
              <span>Cannot get your location. Allow GPS access to see nearest help.</span>
            )}
          </div>
        )}

        {error && <div className="text-xs text-sev-CRITICAL">{error}</div>}

        {data && !data.available && (
          <div className="text-xs italic text-muted-foreground">DATA UNAVAILABLE — nearest help lookup could not run.</div>
        )}

        {data && data.available && data.items.length === 0 && (
          <div className="text-xs italic text-muted-foreground">
            No matching help resources found in the database for your authorized location. Try changing the category.
          </div>
        )}

        {data && data.available && data.items.length > 0 && (
          <>
            <div className="text-xs text-muted-foreground">
              Reference: ({data.reference.lat.toFixed(4)}, {data.reference.lng.toFixed(4)}) · {data.items.length} options ranked
            </div>
            {data.groups.map((g) => (
              <div key={g.kind} className="border border-border rounded-md p-2.5 bg-card/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <span>{g.icon}</span> {g.label}
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{g.items.length}</Badge>
                </div>
                {g.items.map((it, idx) => (
                  <div key={idx} className="rounded-md border-border/60 bg-background/40 p-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold">{it.name}</div>
                      <div className="text-muted-foreground">{it.category}</div>
                      {it.address && <div className="text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" /> {it.address}</div>}
                      {it.notes && <div className="text-muted-foreground/80 mt-0.5 text-[10px]">{it.notes}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-sm">{it.distanceKm.toFixed(2)} km</div>
                      {it.estimatedMinutes != null && (
                        <div className="text-[10px] text-muted-foreground">≈ {it.estimatedMinutes} min</div>
                      )}
                      <Badge variant={it.status === 'AVAILABLE' || it.status === 'OPEN' || it.status === 'ACCEPTING' ? 'secondary' : 'outline'} className="text-[9px] mt-1">{it.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}
