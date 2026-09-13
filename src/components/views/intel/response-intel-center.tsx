'use client'

// AI RESPONSE INTELLIGENCE CENTER — the 10 game-changer features surfaced as a
// tabbed dashboard over /api/response-intel. Read-only for RESPONDER/CITIZEN;
// officer/admin actions are gated here AND enforced server-side.
//
// Design rules (mirrors src/lib/services/response-intel-service.ts):
//  • Real DB data first. Gemini augments narrative only.
//  • Data genuinely unavailable -> show the honest "DATA UNAVAILABLE" state.
//  • Never fabricate road closures, capacities, or predictions.

import { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import { useAuth } from '@/lib/use-auth'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Brain, RefreshCw, Loader2 } from 'lucide-react'

type Json = any

const canAct = (role?: string) => role === 'DISASTER_OFFICER' || role === 'ADMIN'
const humanize = (s: string) => String(s || '').split('_').join(' ')

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground mt-2">{children}</p>
}

function Unavailable({ reason }: { reason?: string }) {
  return (
    <p className="text-xs italic text-muted-foreground">
      DATA UNAVAILABLE — {reason ? humanize(reason) : 'the feature could not run on current data.'}
    </p>
  )
}

// ─── Overview snapshot ───────────────────────
function Stat({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">{label}</div>
      <div className={`text-2xl font-bold font-mono ${danger ? 'text-destructive' : ''}`}>{value}</div>
    </Card>
  )
}

export function ResponseIntelCenterView() {
  const { user } = useAuth()
  const officer = canAct(user?.role)

  const [incidents, setIncidents] = useState<Json[]>([])
  const [incidentId, setIncidentId] = useState<string>('')
  const [overview, setOverview] = useState<Json | null>(null)
  const [loading, setLoading] = useState(false)

  const loadOverview = useCallback(async (id?: string) => {
    setLoading(true)
    try {
      const r = await apiGet(`/api/response-intel?feature=overview${id ? `&incidentId=${id}` : ''}`)
      setOverview(r)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load intelligence overview')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    apiGet('/api/incidents')
      .then((r) => {
        const list: Json[] = r.incidents || r || []
        setIncidents(list)
        const first = list[0]?.id
        if (first) {
          setIncidentId(first)
          void loadOverview(first)
        } else {
          void loadOverview()
        }
      })
      .catch(() => void loadOverview())
  }, [loadOverview])

  const clusterCount = overview?.clusters?.clusters?.length ?? 0
  const highRiskZones = (overview?.prepositioning?.zones || []).filter((z: Json) => z.attention === 'HIGH_ATTENTION_ZONE').length

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> Response Intelligence
          </h1>
          <p className="text-xs text-muted-foreground">
            Mission planning, rescue corridors, digital twin, swap, ETA risk, shelter matching, damage clusters, pre-positioning &amp; photo triage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={incidentId || undefined} onValueChange={(v) => { setIncidentId(v); void loadOverview(v) }}>
            <SelectTrigger className="w-64 h-9 text-xs"><SelectValue placeholder="Select incident scope" /></SelectTrigger>
            <SelectContent>
              {incidents.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.incidentCode} — {humanize(i.type)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => loadOverview(incidentId || undefined)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Stat label="Damage clusters" value={clusterCount} danger={clusterCount > 0} />
          <Stat label="High-attention zones" value={highRiskZones} danger={highRiskZones > 0} />
          <Stat label="Corridor routes" value={overview.corridor?.routes?.length ?? '—'} />
          <Stat label="Swap flagged" value={overview.swap?.recommendedReplacement ? 'YES' : (overview.swap?.available ? 'NO' : '—')} danger={Boolean(overview.swap?.recommendedReplacement)} />
          <Stat label="Shelter match" value={overview.shelter?.recommended?.status ?? '—'} />
        </div>
      )}

      <Tabs defaultValue="mission" className="space-y-3">
        <ScrollArea className="w-full">
          <TabsList className="inline-flex">
            <TabsTrigger value="mission">Mission Planner</TabsTrigger>
            <TabsTrigger value="corridor">Rescue Corridor</TabsTrigger>
            <TabsTrigger value="twin">Digital Twin</TabsTrigger>
            <TabsTrigger value="swap">Resource Swap</TabsTrigger>
            <TabsTrigger value="eta">ETA Risk</TabsTrigger>
            <TabsTrigger value="shelter">Safe Shelter</TabsTrigger>
            <TabsTrigger value="clusters">Damage Clusters</TabsTrigger>
            <TabsTrigger value="preposition">Pre-Positioning</TabsTrigger>
            <TabsTrigger value="photo">Photo Impact</TabsTrigger>
            <TabsTrigger value="conflicts">Conflicts &amp; Help</TabsTrigger>
          </TabsList>
        </ScrollArea>

        <TabsContent value="mission"><MissionPlanTab incidentId={incidentId} officer={officer} /></TabsContent>
        <TabsContent value="corridor"><CorridorTab incidentId={incidentId} /></TabsContent>
        <TabsContent value="twin"><TwinTab incidentId={incidentId} officer={officer} /></TabsContent>
        <TabsContent value="swap"><SwapTab incidentId={incidentId} officer={officer} /></TabsContent>
        <TabsContent value="eta"><EtaRiskTab incidentId={incidentId} /></TabsContent>
        <TabsContent value="shelter"><ShelterTab incidentId={incidentId} /></TabsContent>
        <TabsContent value="clusters"><ClustersTab /></TabsContent>
        <TabsContent value="preposition"><PrePositioningTab officer={officer} /></TabsContent>
        <TabsContent value="photo"><PhotoImpactTab incidentId={incidentId} /></TabsContent>
        <TabsContent value="conflicts"><ConflictsHelpTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ─── FEATURE 1 — Mission Planner ─────────────────────────────
function MissionPlanTab({ incidentId, officer }: { incidentId: string; officer: boolean }) {
  const [data, setData] = useState<Json | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!incidentId) { setData(null); return }
    setLoading(true)
    apiGet(`/api/response-intel?feature=mission-plan&incidentId=${incidentId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [incidentId])

  if (!incidentId) return <p className="text-xs text-muted-foreground">Select an incident scope above to generate a mission plan.</p>
  if (loading) return <p className="text-xs text-muted-foreground">Generating mission plan…</p>
  if (!data) return <Unavailable />
  if (!data.available) return <Unavailable reason={data.dataUnavailableReason} />

  const p = data.plan
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card className="p-4 text-xs space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-bold">Mission plan — {data.incidentCode}</span>
          <Badge variant="outline" className="text-[9px]">{data.source === 'ai' ? 'AI-REFINED' : 'DETERMINISTIC'}</Badge>
          {data.approvalDecision && <Badge variant={data.approvalDecision === 'APPROVED' ? 'default' : 'secondary'} className="ml-auto text-[9px]">{data.approvalDecision}</Badge>}
        </div>
        <div><b>Immediate action:</b> {p.immediateAction}</div>
        <div><b>Rescue priority:</b> {p.rescuePriority}</div>
        <div><b>Recommended team:</b> {p.recommendedTeam}</div>
        <div><b>Recommended route:</b> {p.recommendedRoute}</div>
        <div><b>Escalation:</b> {p.escalationCondition}</div>
      </Card>
      <div className="space-y-3">
        <Card className="p-4 text-xs">
          <h3 className="text-sm font-bold mb-1.5">Required resources</h3>
          <ul className="space-y-0.5">{p.requiredResources.map((r: string, i: number) => <li key={i}>• {r}</li>)}</ul>
        </Card>
        <Card className="p-4 text-xs">
          <h3 className="text-sm font-bold mb-1.5">Safety precautions</h3>
          <ul className="space-y-0.5">{p.safetyPrecautions.map((r: string, i: number) => <li key={i}>• {r}</li>)}</ul>
        </Card>
        <Card className="p-4 text-xs">
          <h3 className="text-sm font-bold mb-1.5">Communication requirements</h3>
          <ul className="space-y-0.5">{p.communicationRequirements.map((r: string, i: number) => <li key={i}>• {r}</li>)}</ul>
        </Card>
        <Note>
          Context: risk {data.context.riskLevel ?? '—'} ({data.context.riskScore ?? '—'}) · people {data.context.peopleAffected ?? 'unknown'} ·
          road blocked {String(data.context.roadBlocked ?? 'unknown')} · {data.context.activeAssignmentCount} active assignment(s).
          {officer && data.approvalId && ' Approval request created — action it under Approvals.'}
        </Note>
      </div>
    </div>
  )
}

// ─── FEATURE 2 — Dynamic Rescue Corridor ─────────────────────
function CorridorTab({ incidentId }: { incidentId: string }) {
  const [data, setData] = useState<Json | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!incidentId) { setData(null); return }
    setLoading(true)
    apiGet(`/api/response-intel?feature=corridor&incidentId=${incidentId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [incidentId])

  if (!incidentId) return <p className="text-xs text-muted-foreground">Select an incident scope above.</p>
  if (loading) return <p className="text-xs text-muted-foreground">Computing corridor options…</p>
  if (!data) return <Unavailable />
  if (!data.available) return <Unavailable reason={data.dataUnavailableReason} />

  const statusVariant = (s: string) => (s === 'SAFE' ? 'default' : s === 'ALTERNATIVE' ? 'secondary' : 'destructive')

  return (
    <div className="space-y-3">
      {data.recommended && (
        <Card className="p-3 text-xs border-primary/40">
          <span className="font-bold">Recommended:</span> {humanize(data.recommended)}
        </Card>
      )}
      <div className="grid md:grid-cols-2 gap-2">
        {data.routes.map((r: Json, i: number) => (
          <Card key={i} className="p-3 text-xs space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant(r.status)} className="text-[9px]">{r.status}</Badge>
              <span className="font-mono text-muted-foreground">{humanize(r.label)}</span>
              {r.distanceKm != null && <span className="ml-auto font-mono">{r.distanceKm} km · {r.etaMinutes} min</span>}
            </div>
            <div>{r.description}</div>
            <ul className="text-muted-foreground space-y-0.5">{r.reasons.map((x: string, k: number) => <li key={k}>• {x}</li>)}</ul>
          </Card>
        ))}
        {data.routes.length === 0 && <Unavailable reason="no routes could be derived" />}
      </div>
      <Note>Routes are derived from DB-recorded resource positions and the incident's road-blockage flag. Road-network routing requires an external routing API.</Note>
    </div>
  )
}

// ─── FEATURE 3 — Disaster Digital Twin (+ simulation) ────────────────────────
function TwinTab({ incidentId, officer }: { incidentId: string; officer: boolean }) {
  const [twin, setTwin] = useState<Json | null>(null)
  const [sim, setSim] = useState<Json | null>(null)
  const [scenario, setScenario] = useState<'ROAD_BLOCKED' | 'RESOURCE_UNAVAILABLE' | 'NEW_INCIDENT_NEARBY'>('ROAD_BLOCKED')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiGet(`/api/response-intel?feature=twin${incidentId ? `&incidentId=${incidentId}` : ''}`)
      .then(setTwin)
      .catch(() => setTwin(null))
  }, [incidentId])

  const runSim = async () => {
    setBusy(true)
    try {
      const r = await apiPost('/api/response-intel', { action: 'twin-simulate', incidentId: incidentId || undefined, scenario })
      setSim(r)
    } catch (e: any) {
      toast.error(e?.message || 'Simulation failed')
    } finally {
      setBusy(false)
    }
  }

  if (!twin) return <p className="text-xs text-muted-foreground">Loading twin state…</p>
  if (!twin.available) return <Unavailable reason={twin.dataUnavailableReason} />

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card className="p-4 text-xs space-y-1 font-mono">
        <h3 className="text-sm font-bold mb-1">Scope</h3>
        <div>Code: {twin.scope?.code ?? 'GLOBAL'}</div>
        <div>Type: {twin.scope?.type ? humanize(twin.scope.type) : '—'} · status {twin.scope?.status ? humanize(twin.scope.status) : '—'}</div>
        <div>Location: {twin.scope?.location ?? '—'} ({twin.scope?.lat ?? '—'}, {twin.scope?.lng ?? '—'})</div>
        <div>Risk: {twin.scope?.riskLevel ?? '—'}</div>
        <div>Primary road blocked: {String(twin.roads?.primaryBlocked ?? 'unknown')}</div>
        {twin.impactZones && (
          <div>Impact zones: 1km {String(twin.impactZones.impactZone1Km ?? '—')} · 5km {String(twin.impactZones.impactZone5Km ?? '—')} · 10km {String(twin.impactZones.impactZone10Km ?? '—')}</div>
        )}
      </Card>
      <Card className="p-4 text-xs">
        <h3 className="text-sm font-bold mb-1.5">Resources in scope ({twin.resources?.length ?? 0})</h3>
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
          {(twin.resources || []).map((r: Json) => (
            <Badge key={r.code} variant="outline" className="font-mono text-[10px]">{r.code} · {humanize(r.type)} · {r.status}</Badge>
          ))}
        </div>
      </Card>
      <Card className="p-4 text-xs">
        <h3 className="text-sm font-bold mb-1.5">Safe places ({twin.safePlaces?.length ?? 0})</h3>
        <div className="space-y-0.5 font-mono max-h-40 overflow-y-auto">
          {(twin.safePlaces || []).map((p: Json, i: number) => <div key={i}>{p.name} · {humanize(p.type)} · {p.availability}</div>)}
          {!twin.safePlaces?.length && <span className="text-muted-foreground">None indexed.</span>}
        </div>
      </Card>
      <Card className="p-4 text-xs">
        <h3 className="text-sm font-bold mb-1.5">Hazards ({twin.hazards?.length ?? 0})</h3>
        <div className="space-y-0.5 font-mono max-h-40 overflow-y-auto">
          {(twin.hazards || []).map((h: Json) => <div key={h.id}>{humanize(h.type)} · {h.severity} · {humanize(h.status)}</div>)}
          {!twin.hazards?.length && <span className="text-muted-foreground">None recorded.</span>}
        </div>
      </Card>
      <div className="md:col-span-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={scenario} onValueChange={(v) => setScenario(v as any)}>
            <SelectTrigger className="w-60 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ROAD_BLOCKED">Road blocked</SelectItem>
              <SelectItem value="RESOURCE_UNAVAILABLE">Resource unavailable</SelectItem>
              <SelectItem value="NEW_INCIDENT_NEARBY">New incident nearby</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={runSim} disabled={busy || !officer} title={officer ? '' : 'Officers/admins only'}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Run simulation
          </Button>
        </div>
        {sim && (
          <Card className="p-3 text-xs space-y-1">
            {sim.available === false ? <Unavailable reason={sim.dataUnavailableReason} /> : (
              <>
                <div className="font-bold">Scenario: {humanize(scenario)}</div>
                <ul className="space-y-0.5">{(sim.predictedOperationalImpact || []).map((x: string, i: number) => <li key={i}>• {x}</li>)}</ul>
                <div className="text-muted-foreground mt-1">Recommended: {(sim.recommendedChanges || []).join(' · ')}</div>
                <Note>{sim.disclaimer}</Note>
              </>
            )}
          </Card>
        )}
      </div>
      <div className="md:col-span-2"><Note>{twin.note}</Note></div>
    </div>
  )
}

// ─── FEATURE 5 — AI Resource Swap Engine ─────────────────────
function SwapTab({ incidentId, officer }: { incidentId: string; officer: boolean }) {
  const [data, setData] = useState<Json | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!incidentId) { setData(null); return }
    setLoading(true)
    apiGet(`/api/response-intel?feature=swap&incidentId=${incidentId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [incidentId])

  if (!incidentId) return <p className="text-xs text-muted-foreground">Select an incident scope above.</p>
  if (loading) return <p className="text-xs text-muted-foreground">Evaluating swap options…</p>
  if (!data) return <Unavailable />
  if (!data.available) return <Unavailable reason={data.dataUnavailableReason} />

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card className="p-4 text-xs space-y-1">
        <h3 className="text-sm font-bold mb-1">Current assignment</h3>
        {data.currentResource ? (
          <>
            <div className="font-mono">{data.currentResource.code} — {data.currentResource.name}</div>
            <div className="text-muted-foreground">{humanize(data.currentResource.type)} · {data.currentResource.status}</div>
            <div className="mt-1"><b>Problem:</b> {data.problem}</div>
          </>
        ) : (
          <p className="text-muted-foreground">{data.problem}</p>
        )}
      </Card>
      <Card className="p-4 text-xs space-y-1">
        <h3 className="text-sm font-bold mb-1">Recommended replacement</h3>
        {data.recommendedReplacement ? (
          <>
            <div className="font-mono">{data.recommendedReplacement.code} — {data.recommendedReplacement.name}</div>
            <div className="text-muted-foreground">
              {humanize(data.recommendedReplacement.type)} · cap {data.recommendedReplacement.capacity} ·
              {data.recommendedReplacement.distanceKm} km · ETA ~{data.recommendedReplacement.estimatedArrivalMinutes} min
            </div>
            <div className="mt-1">{data.reason}</div>
            {officer && data.approvalId && <Note>Approval request created — action it under Approvals.</Note>}
            {officer && !data.approvalId && <Note>No active problem detected — no approval created.</Note>}
          </>
        ) : (
          <p className="text-muted-foreground">{data.reason}</p>
        )}
      </Card>
    </div>
  )
}

// ─── FEATURE 8 — Rescue ETA Risk Predictor ───────────────────
function EtaRiskTab({ incidentId }: { incidentId: string }) {
  const [resources, setResources] = useState<Json[]>([])
  const [resourceId, setResourceId] = useState<string>('')
  const [data, setData] = useState<Json | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Join the incident's assignments (resourceId list) with the resource catalogue
    // so the predictor runs only on resources actually assigned to this incident.
    if (!incidentId) { setResources([]); return }
    Promise.all([
      apiGet(`/api/incidents/${incidentId}`),
      apiGet('/api/resources'),
    ])
      .then(([inc, res]) => {
        const assignments: Json[] = inc?.incident?.ResourceAssignment || []
        const assignedIds = new Set(
          assignments.filter((a: Json) => a.replacedAt == null).map((a: Json) => a.resourceId),
        )
        const catalogue: Json[] = res?.resources || []
        const mapped = catalogue
          .filter((r: Json) => assignedIds.has(r.id))
          .map((r: Json) => ({ id: r.id, code: r.resourceCode, type: r.type }))
        setResources(mapped)
        if (mapped[0]?.id) setResourceId(mapped[0].id)
      })
      .catch(() => setResources([]))
  }, [incidentId])

  useEffect(() => {
    if (!incidentId || !resourceId) { setData(null); return }
    setLoading(true)
    apiGet(`/api/response-intel?feature=eta-risk&incidentId=${incidentId}&resourceId=${resourceId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [incidentId, resourceId])

  if (!incidentId) return <p className="text-xs text-muted-foreground">Select an incident scope above.</p>
  if (!resources.length) return <p className="text-xs text-muted-foreground">No resources are assigned to this incident — the ETA risk predictor runs on an existing assignment.</p>

  return (
    <div className="space-y-3">
      <Select value={resourceId || undefined} onValueChange={setResourceId}>
        <SelectTrigger className="w-72 h-8 text-xs"><SelectValue placeholder="Select assigned resource" /></SelectTrigger>
        <SelectContent>{resources.map((r) => <SelectItem key={r.id} value={r.id}>{r.code} — {humanize(r.type)}</SelectItem>)}</SelectContent>
      </Select>
      {loading && <p className="text-xs text-muted-foreground">Predicting ETA risk…</p>}
      {data && !data.available && <Unavailable reason={data.dataUnavailableReason} />}
      {data && data.available && (
        <Card className="p-4 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={data.etaRisk === 'HIGH' ? 'destructive' : data.etaRisk === 'MEDIUM' ? 'secondary' : 'default'} className="text-[9px]">
              ETA RISK: {data.etaRisk}
            </Badge>
            <span className="font-mono">{data.resourceCode} · route {data.routeStatus}</span>
          </div>
          <div className="font-mono">Base ETA: {data.etaMinutes ?? '—'} min</div>
          <div><b>Delay reason:</b> {data.delayReason ?? 'none detected'}</div>
          {data.alternativeAction && <div><b>Recommended action:</b> {data.alternativeAction}</div>}
          <div className="text-muted-foreground">Last location update: {data.lastLocationUpdate ? new Date(data.lastLocationUpdate).toLocaleString() : '—'}</div>
        </Card>
      )}
    </div>
  )
}

// ─── FEATURE 9 — Capacity-Aware Safe Shelter Matching ────────────────────────
function ShelterTab({ incidentId }: { incidentId: string }) {
  const [data, setData] = useState<Json | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const q = incidentId ? `&incidentId=${incidentId}` : ''
    apiGet(`/api/response-intel?feature=shelter${q}&limit=5`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [incidentId])

  if (loading) return <p className="text-xs text-muted-foreground">Matching safe shelters…</p>
  if (!data) return <Unavailable />
  if (!data.available) return <Unavailable reason={data.dataUnavailableReason} />
  if (!data.recommended) return <p className="text-xs italic text-muted-foreground">{data.note}</p>

  const render = (o: Json, primary: boolean) => (
    <Card key={o.id} className={`p-3 text-xs space-y-1 ${primary ? 'border-primary/40' : ''}`}>
      <div className="flex items-center gap-2">
        {primary && <Badge className="text-[9px]">RECOMMENDED</Badge>}
        <span className="font-bold">{o.name}</span>
        <Badge variant={o.status === 'OPEN' ? 'default' : o.status === 'LIMITED' ? 'secondary' : 'destructive'} className="ml-auto text-[9px]">{o.status}</Badge>
      </div>
      <div className="text-muted-foreground">{o.category} · {o.distanceKm} km · {o.estimatedMinutes ?? '—'} min</div>
      <div className="font-mono text-muted-foreground">
        {o.totalCapacity != null ? `cap ${o.availableCapacity}/${o.totalCapacity}${o.occupancyPct != null ? ` (${o.occupancyPct}%)` : ''}` : `availability ${o.availability}`}
        {o.safetyStatus ? ` · ${o.safetyStatus}` : ''}
      </div>
      {o.facilities?.length > 0 && <div className="text-muted-foreground">Facilities: {o.facilities.join(', ')}</div>}
      <ul className="text-muted-foreground space-y-0.5">{o.reasons.map((r: string, i: number) => <li key={i}>• {r}</li>)}</ul>
      <div className="font-mono text-[10px] text-muted-foreground">score {o.score} · source {o.source}</div>
    </Card>
  )

  return (
    <div className="grid md:grid-cols-2 gap-2">
      {render(data.recommended, true)}
      {data.alternatives.map((o: Json) => render(o, false))}
      <div className="md:col-span-2"><Note>{data.note}</Note></div>
    </div>
  )
}

// ─── FEATURE 6 — Crowd-Sourced Damage Clustering ─────────────────────────────
function ClustersTab() {
  const [data, setData] = useState<Json | null>(null)
  useEffect(() => { apiGet('/api/response-intel?feature=damage-clusters').then(setData).catch(() => setData(null)) }, [])

  if (!data) return <p className="text-xs text-muted-foreground">Building damage clusters…</p>
  if (!data.available) return <Unavailable reason={data.dataUnavailableReason} />
  if (!data.clusters?.length) return <p className="text-xs italic text-muted-foreground">{data.note}</p>

  const layerVariant = (l: string) => (l === 'HIGH_RISK_AREA' ? 'destructive' : l === 'ROAD_BLOCKAGE' ? 'secondary' : 'outline')

  return (
    <div className="space-y-2">
      <div className="grid md:grid-cols-2 gap-2">
        {data.clusters.map((c: Json) => (
          <Card key={c.clusterKey} className="p-3 text-xs space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold">{c.clusterKey}</span>
              {c.areaLabel && <span className="text-muted-foreground truncate">{c.areaLabel}</span>}
              <Badge variant="outline" className="ml-auto text-[9px]">{c.reportCount} reports</Badge>
            </div>
            <div className="font-mono text-muted-foreground">
              verified {c.verifiedCount} · possible damage {c.possibleDamageCount} · road blockage {c.roadBlockageCount} · flood zone {c.floodZoneCount}
            </div>
            <div className="flex flex-wrap gap-1">
              {(c.layers || []).map((l: string) => <Badge key={l} variant={layerVariant(l)} className="text-[9px]">{humanize(l)}</Badge>)}
            </div>
            {c.dominantTypes?.length > 0 && (
              <div className="text-muted-foreground">Dominant: {c.dominantTypes.map(humanize).join(', ')}</div>
            )}
          </Card>
        ))}
      </div>
      <Note>{data.note} Citizens only ever receive the public-safe subset, never reporter identity.</Note>
    </div>
  )
}

// ─── FEATURE 10 — Pre-Positioning ────────────────────────────
function PrePositioningTab({ officer }: { officer: boolean }) {
  const [data, setData] = useState<Json | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    apiGet('/api/response-intel?feature=prepositioning')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { if (officer) load() }, [officer, load])

  if (!officer) return <p className="text-xs text-muted-foreground">Pre-positioning recommendations are restricted to officers/admins.</p>
  if (loading) return <p className="text-xs text-muted-foreground">Computing preparedness plan…</p>
  if (!data) return <Unavailable />
  if (!data.available) return <Unavailable reason={data.dataUnavailableReason} />
  if (!data.zones?.length) return <p className="text-xs italic text-muted-foreground">{data.note}</p>

  const attentionVariant = (a: string) => (a === 'HIGH_ATTENTION_ZONE' ? 'destructive' : a === 'MEDIUM_ATTENTION_ZONE' ? 'secondary' : 'outline')

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="grid md:grid-cols-2 gap-2">
        {data.zones.map((z: Json) => (
          <Card key={z.zone} className="p-3 text-xs space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={attentionVariant(z.attention)} className="text-[9px]">{humanize(z.attention)}</Badge>
              <span className="font-mono">Grid {z.zone}</span>
              <span className="ml-auto font-mono text-muted-foreground">priority {z.priority}</span>
            </div>
            <div className="font-mono text-muted-foreground">
              {z.activeIncidentCount} active · {z.historicIncidentCount} recent · staging: {z.suggestedStagingLocation}
            </div>
            <div className="text-muted-foreground">{z.reason}</div>
            {z.recommendedResources?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {z.recommendedResources.map((r: Json, i: number) => (
                  <Badge key={i} variant="outline" className="text-[9px]">{humanize(r.type)} ×{r.quantity}</Badge>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
      <Note>{data.note}</Note>
    </div>
  )
}

// ─── FEATURE 7 — Photo-to-Impact Intelligence ────────────────────────────────
function PhotoImpactTab({ incidentId }: { incidentId: string }) {
  const [data, setData] = useState<Json | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!incidentId) { setData(null); return }
    setLoading(true)
    apiGet(`/api/response-intel?feature=photo&incidentId=${incidentId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [incidentId])

  if (!incidentId) return <p className="text-xs text-muted-foreground">Select an incident scope above.</p>
  if (loading) return <p className="text-xs text-muted-foreground">Triaging incident photo metadata…</p>
  if (!data) return <Unavailable />
  if (!data.available) return <Unavailable reason={data.dataUnavailableReason} />

  const sourceLabel = data.source === 'ai' ? 'AI-ASSISTED' : 'DETERMINISTIC'

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card className="p-4 text-xs space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-bold">Impact triage</span>
          <Badge variant="outline" className="text-[9px]">{sourceLabel}</Badge>
          {data.confidence != null && <span className="ml-auto font-mono text-muted-foreground">conf {Math.round(data.confidence * 100)}%</span>}
        </div>
        <div><b>Observed conditions:</b> {data.observedConditions.length ? data.observedConditions.join(', ') : 'none derived'}</div>
        <div><b>Possible hazards:</b> {data.possibleHazards.length ? data.possibleHazards.join(', ') : 'none derived'}</div>
        <div><b>Affected infrastructure:</b> {data.affectedInfrastructure.length ? data.affectedInfrastructure.join(', ') : 'none derived'}</div>
        <div><b>Accessibility:</b> {data.accessibility}</div>
      </Card>
      <div className="space-y-3">
        <Note>{data.notes}</Note>
        <Note>The system never claims facts that cannot be derived from image metadata + description. Raw pixels are not analysed unless an AI provider is configured.</Note>
      </div>
    </div>
  )
}

// ─── Conflicts & Nearest Help (cross-cutting databases) ──────────────────────
function ConflictsHelpTab() {
  const [conflicts, setConflicts] = useState<Json | null>(null)
  const [help, setHelp] = useState<Json | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    apiGet('/api/response-intel?feature=conflicts').then(setConflicts).catch(() => setConflicts(null))
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setCoords(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      )
    }
  }, [])

  useEffect(() => {
    if (!coords) return
    apiGet(`/api/response-intel?feature=nearest-help&lat=${coords.lat}&lng=${coords.lng}&kind=all&limit=5`)
      .then(setHelp)
      .catch(() => setHelp(null))
  }, [coords])

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div>
        <h3 className="text-sm font-bold mb-2">Resource conflicts</h3>
        {conflicts && !conflicts.available && <Unavailable reason={conflicts.dataUnavailableReason} />}
        {conflicts?.available && conflicts.conflicts?.length === 0 && <p className="text-xs text-muted-foreground">No resource conflicts detected.</p>}
        {(conflicts?.conflicts || []).map((c: Json, i: number) => (
          <Card key={i} className="p-3 mb-2 text-xs border-destructive/40">
            <div className="font-bold text-destructive">{humanize(c.conflictType)} — {c.resourceCode ?? c.resourceName ?? ''}</div>
            <div className="text-muted-foreground">{c.recommendation ?? c.detail ?? ''}</div>
          </Card>
        ))}
      </div>
      <div>
        <h3 className="text-sm font-bold mb-2">Nearest available help</h3>
        {!coords && <p className="text-xs text-muted-foreground">Allow GPS access to rank nearest available help.</p>}
        {help && !help.available && <Unavailable reason={help.dataUnavailableReason} />}
        {help?.available && help.items?.length === 0 && <p className="text-xs text-muted-foreground">No matching help found for your location.</p>}
        {(help?.items || []).map((it: Json, i: number) => (
          <Card key={i} className="p-3 mb-2 text-xs flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">{it.name}</div>
              <div className="text-muted-foreground">{it.category}</div>
            </div>
            <div className="text-right shrink-0 font-mono">
              <div>{it.distanceKm} km</div>
              {it.estimatedMinutes != null && <div className="text-[10px] text-muted-foreground">≈ {it.estimatedMinutes} min</div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
