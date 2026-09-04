'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from '@/lib/use-router'
import { apiGet, apiPost } from '@/lib/api-client'
import { useRealtimeEvents } from '@/lib/use-realtime'
import { toast } from 'sonner'
import { Plus, Search, ShieldAlert, Inbox, Loader2, Siren } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { IncidentTypeBadge, RiskBadge, StatusBadge } from '@/components/shared/badges'
import type { Incident, IncidentStatus, RiskLevel, DashboardEvent } from '@/lib/types'
import { EmergencyServices } from '@/components/shared/emergency-services'

export function CitizenDashboardView() {
  const { navigate } = useRouter()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [trackCode, setTrackCode] = useState('')
  const [sosLoading, setSosLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ incidents: Incident[] }>('/api/incidents')
      setIncidents(res.incidents)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Refresh on realtime events affecting incidents — listen for ALL status transitions
  useRealtimeEvents(useCallback((e: DashboardEvent) => {
    if (
      e.type.startsWith('INCIDENT') ||
      e.type === 'NOTIFICATION' ||
      e.type === 'RESOURCE_ASSIGNED' ||
      e.type === 'APPROVAL_GRANTED' ||
      e.type === 'APPROVAL_REJECTED' ||
      e.type === 'APPROVAL_REQUIRED' ||
      e.type === 'REASSIGNMENT' ||
      e.type === 'RESOURCE_UNAVAILABLE' ||
      e.type === 'RESPONSE_ACKNOWLEDGED' ||
      e.type === 'RESPONSE_STARTED' ||
      e.type === 'RESPONSE_ARRIVED' ||
      e.type === 'RESPONSE_DELAYED' ||
      e.type === 'RISK_CALCULATED' ||
      e.type === 'RESOURCE_RECOMMENDED'
    ) {
      load()
    }
  }, [load]))

  const total = incidents.length
  const active = incidents.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status)).length
  const resolved = incidents.filter((i) => ['RESOLVED', 'CLOSED'].includes(i.status)).length

  const track = (e: React.FormEvent) => {
    e.preventDefault()
    if (!trackCode.trim()) return
    // Reuse track-incident route with query
    navigate(`/track-incident?code=${encodeURIComponent(trackCode.trim().toUpperCase())}`)
  }

  const sendSos = () => {
    if (!navigator.geolocation) return toast.error('Location is not available on this device.')
    if (!window.confirm('Send an emergency SOS report with your current location?')) return
    setSosLoading(true)
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const res = await apiGet<{ shortName?: string }>(`/api/geocode/reverse?lat=${position.coords.latitude}&lng=${position.coords.longitude}`)
        const created = await apiPost<{ incidentCode: string }>('/api/incidents', {
          incidentType: 'MEDICAL',
          description: 'Citizen SOS: immediate assistance requested at current location.',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          location: res.shortName || undefined,
          inputMethod: 'text',
          locationAccuracy: position.coords.accuracy,
          locationTimestamp: new Date(position.timestamp).toISOString(),
        })
        toast.success(`SOS sent: ${created.incidentCode}`)
        load()
      } catch (error: any) { toast.error(error.message || 'SOS could not be sent') }
      finally { setSosLoading(false) }
    }, () => { setSosLoading(false); toast.error('Location permission is required for SOS.') }, { enableHighAccuracy: true, timeout: 10000 })
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">My Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">View your submitted incidents and track their status.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Total" value={total} />
        <Stat label="Active" value={active} />
        <Stat label="Resolved" value={resolved} />
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Button onClick={() => navigate('/report-incident')} className="gap-2">
          <Plus className="h-4 w-4" /> Report New Incident
        </Button>
        <form onSubmit={track} className="flex gap-2 sm:col-span-2">
          <Input placeholder="Track by code: RF-2026-000001" value={trackCode} onChange={(e) => setTrackCode(e.target.value)} />
          <Button type="submit" variant="outline" className="gap-1.5"><Search className="h-3.5 w-3.5" /> Track</Button>
        </form>
      </div>

      <div className="grid gap-3 mb-5 md:grid-cols-2">
        <Button variant="destructive" onClick={sendSos} disabled={sosLoading} className="gap-2">
          {sosLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />}
          {sosLoading ? 'Locating and sending SOS…' : 'Emergency SOS'}
        </Button>
        {incidents[0]?.latitude && <EmergencyServices lat={incidents[0].latitude} lng={incidents[0].longitude} />}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : incidents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">You haven't reported any incidents yet.</p>
            <Button className="mt-3 gap-1.5" onClick={() => navigate('/report-incident')}>
              <Plus className="h-4 w-4" /> Report your first incident
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {incidents.map((inc) => (
            <Card key={inc.id} className="hover:bg-accent/30 transition cursor-pointer" >
              <CardContent className="p-4" onClick={() => navigate(`/track-incident?code=${encodeURIComponent(inc.incidentCode)}`)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-primary">{inc.incidentCode}</span>
                  <IncidentTypeBadge type={inc.type} />
                  <StatusBadge status={inc.status as IncidentStatus} />
                  {inc.riskLevel && <RiskBadge level={inc.riskLevel as RiskLevel} score={inc.riskScore ?? undefined} />}
                  {inc.duplicateFlag && <Badge variant="outline" className="text-[9px] text-sev-MEDIUM border-sev-MEDIUM">POSSIBLE DUPLICATE</Badge>}
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                    {new Date(inc.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1.5 text-sm line-clamp-2">{inc.description}</p>
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" /> {inc.location}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
