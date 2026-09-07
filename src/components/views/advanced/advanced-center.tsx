'use client'

// Advanced AI Command Center (SIH upgrade) — covers all 20 advanced features
// over a tabbed dashboard. Read-only for RESPONDER/CITIZEN; action buttons
// gated to DISASTER_OFFICER/ADMIN (enforced server-side too).

import { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'
import { useAuth } from '@/lib/use-auth'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Brain, RefreshCw } from 'lucide-react'

type Json = any
const canAct = (role?: string) => role === 'DISASTER_OFFICER' || role === 'ADMIN'

function Stat({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">{label}</div>
      <div className={`text-2xl font-bold font-mono ${danger ? 'text-destructive' : ''}`}>{value}</div>
    </Card>
  )
}

export function AdvancedCenterView() {
  const { user } = useAuth()
  const officer = canAct(user?.role)
  const [overview, setOverview] = useState<Json | null>(null)
  const [incidents, setIncidents] = useState<Json[]>([])
  const [incidentId, setIncidentId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const loadOverview = useCallback(async () => {
    try { setOverview(await apiGet('/api/advanced')) } catch { /* keep previous overview */ }
  }, [])
  useEffect(() => {
    apiGet('/api/advanced').then(setOverview).catch((e: any) => toast.error(e.message || 'Failed to load overview'))
    apiGet('/api/incidents').then((r) => {
      const list: Json[] = r.incidents || r || []
      if (list[0]?.id) setIncidentId(list[0].id)
      setIncidents(list)
    }).catch(() => {})
  }, [])

  const busy = async (fn: () => Promise<any>, okMsg?: string) => {
    setLoading(true)
    try { await fn(); if (okMsg) toast.success(okMsg) } catch (e: any) { toast.error(e.message || 'Action failed') } finally { setLoading(false) }
  }
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> AI Command Center</h1>
          <p className="text-xs text-muted-foreground">Advanced intelligence — twin, forecast, cascade, evacuation, logistics, simulation & learning</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => busy(loadOverview)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {overview?.blackout && (
        <Card className="border-destructive/50 bg-destructive/10 p-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-bold text-destructive">⚠ COMMUNICATION BLACKOUT ACTIVE ({overview.blackout.mode})</div>
            <div className="text-xs text-muted-foreground">{overview.blackout.reason}</div>
          </div>
          {officer && (
            <Button size="sm" variant="destructive" onClick={() => busy(async () => { await apiPost('/api/advanced', { action: 'set-blackout', active: false }); loadOverview() }, 'Blackout lifted')}>
              Lift blackout
            </Button>
          )}
        </Card>
      )}

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Stat label="Active incidents" value={overview.counts.activeIncidents} />
          <Stat label="Cascade links" value={overview.counts.cascadeLinks} danger={overview.counts.cascadeLinks > 0} />
          <Stat label="Conflicts" value={overview.counts.conflicts} danger={overview.counts.conflicts > 0} />
          <Stat label="Overloaded" value={overview.counts.overloadedResponders} danger={overview.counts.overloadedResponders > 0} />
          <Stat label="Critical expiry" value={overview.counts.criticalExpiry} danger={overview.counts.criticalExpiry > 0} />
          <Stat label="Active insights" value={overview.counts.activeInsights} />
        </div>
      )}

      <Tabs defaultValue="twin" className="space-y-3">
        <ScrollArea className="w-full">
          <TabsList className="inline-flex">
            <TabsTrigger value="twin">Digital Twin</TabsTrigger>
            <TabsTrigger value="forecast">Forecast & Conflicts</TabsTrigger>
            <TabsTrigger value="cascade">Cascade & Graph</TabsTrigger>
            <TabsTrigger value="evac">Evacuation</TabsTrigger>
            <TabsTrigger value="logistics">Logistics</TabsTrigger>
            <TabsTrigger value="missing">Missing Persons</TabsTrigger>
            <TabsTrigger value="hospitals">Hospitals</TabsTrigger>
            <TabsTrigger value="people">People Safety</TabsTrigger>
            <TabsTrigger value="evidence">Evidence & Trust</TabsTrigger>
            <TabsTrigger value="whatif">What-If</TabsTrigger>
            <TabsTrigger value="learning">Explain & Learn</TabsTrigger>
          </TabsList>
        </ScrollArea>
        <TabsContent value="twin"><TwinTab incidentId={incidentId} setIncidentId={setIncidentId} incidents={incidents} /></TabsContent>
        <TabsContent value="forecast"><ForecastTab officer={officer} /></TabsContent>
        <TabsContent value="cascade"><CascadeTab overview={overview} officer={officer} reload={loadOverview} busy={busy} /></TabsContent>
        <TabsContent value="evac"><EvacTab incidentId={incidentId} officer={officer} busy={busy} /></TabsContent>
        <TabsContent value="logistics"><LogisticsTab officer={officer} busy={busy} /></TabsContent>
        <TabsContent value="missing"><MissingTab officer={officer} busy={busy} /></TabsContent>
        <TabsContent value="hospitals"><HospitalsTab incidentId={incidentId} /></TabsContent>
        <TabsContent value="people"><PeopleTab /></TabsContent>
        <TabsContent value="evidence"><EvidenceTab incidentId={incidentId} officer={officer} busy={busy} /></TabsContent>
        <TabsContent value="whatif"><WhatIfTab officer={officer} busy={busy} /></TabsContent>
        <TabsContent value="learning"><LearnTab incidentId={incidentId} officer={officer} busy={busy} /></TabsContent>
      </Tabs>
    </div>
  )
}
// ===== Digital Twin tab (feature 1) =====
function TwinTab({ incidentId, setIncidentId, incidents }: { incidentId: string; setIncidentId: (v: string) => void; incidents: Json[] }) {
  const [twin, setTwin] = useState<Json | null>(null)
  useEffect(() => {
    apiGet(`/api/advanced?feature=twin${incidentId ? `&incidentId=${incidentId}` : ''}`).then(setTwin).catch(() => {})
  }, [incidentId])
  return (
    <div className="space-y-3">
      <Select value={incidentId || undefined} onValueChange={setIncidentId}>
        <SelectTrigger className="w-72"><SelectValue placeholder="Select incident scope" /></SelectTrigger>
        <SelectContent>{incidents.map((i) => <SelectItem key={i.id} value={i.id}>{i.incidentCode} — {i.type}</SelectItem>)}</SelectContent>
      </Select>
      {twin ? (
        <div className="grid md:grid-cols-2 gap-3">
          <Card className="p-4">
            <h3 className="text-sm font-bold mb-2">Environment</h3>
            <div className="text-xs space-y-1 font-mono">
              <div>Scope: {twin.scope?.code ?? 'GLOBAL'} {twin.scope?.location ? `@ ${twin.scope.location}` : ''}</div>
              <div>People affected: {twin.environment.peopleAffected ?? '—'}</div>
              <div>Risk: {twin.environment.riskScore ?? '—'} ({twin.environment.riskLevel ?? '—'})</div>
              <div>Weather: {twin.environment.weather ? 'live' : 'unavailable'}</div>
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold mb-2">Resources</h3>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(twin.resources.byStatus).map(([k, v]) => (
                <Badge key={k} variant="outline" className="font-mono text-[10px]">{k}: {v as number}</Badge>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold mb-2">Safe zones / hospitals / corridors</h3>
            <div className="text-xs space-y-1">
              {twin.safeZones.map((z: Json) => <div key={z.code} className="font-mono">{z.code} · {z.type} · cap {z.capacity} · {z.status}</div>)}
              {twin.hospitals.map((h: Json) => <div key={h.name} className="font-mono">{h.name} · {h.availableBeds} beds {h.demo && <Badge variant="outline" className="text-[9px]">DEMO</Badge>}</div>)}
              {twin.corridors.map((c: Json) => <div key={c.code} className="font-mono">{c.code} · {c.status} · ETA {c.etaMinutes}m</div>)}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold mb-2">Recent timeline</h3>
            <div className="text-xs space-y-0.5 font-mono max-h-48 overflow-y-auto">
              {twin.timeline.slice(-15).map((e: Json, i: number) => <div key={i}>{new Date(e.at).toLocaleTimeString()} · {e.type}</div>)}
            </div>
          </Card>
          <Note>{twin.note} <span className="font-semibold">Hospital nodes are DEMO.</span></Note>
        </div>
      ) : <p className="text-xs text-muted-foreground">Loading twin state…</p>}
    </div>
  )
}

// ===== Forecast & Conflicts tab (features 2 + 3) =====
function ForecastTab({ officer }: { officer: boolean }) {
  const [data, setData] = useState<Json | null>(null)
  const load = () => apiGet('/api/advanced?feature=forecasts').then(setData).catch((e) => toast.error(e.message))
  useEffect(() => { if (officer) void load() }, [officer])
  return (
    <div className="space-y-3">
      {officer && <Button size="sm" onClick={load}>Run 24h demand forecast</Button>}
      <div className="grid md:grid-cols-2 gap-2">
        {(data?.forecasts || []).map((f: Json, i: number) => (
          <Card key={i} className="p-3 text-xs">
            <div className="font-bold">{f.region} — {String(f.resourceType).replace(/_/g, ' ')}</div>
            <div className="font-mono text-muted-foreground">
              demand {f.predictedDemand} · supply {f.currentSupply} · gap <span className={f.gap > 0 ? 'text-destructive font-bold' : 'text-green-600'}>{f.gap > 0 ? `+${f.gap}` : f.gap}</span> · conf {(f.confidence * 100).toFixed(0)}%
            </div>
          </Card>
        ))}
        {data && !data.forecasts?.length && <p className="text-xs text-muted-foreground">No active incidents to forecast, or insufficient permissions.</p>}
      </div>
      <ConflictsSection />
    </div>
  )
}

function ConflictsSection() {
  const [conflicts, setConflicts] = useState<Json[]>([])
  useEffect(() => { apiGet('/api/advanced?feature=conflicts').then((r) => setConflicts(r.conflicts || [])).catch(() => {}) }, [])
  return (
    <div>
      <h3 className="text-sm font-bold mb-2">Resource conflict resolutions</h3>
      {conflicts.length === 0 ? <p className="text-xs text-muted-foreground">No conflicts detected.</p> : conflicts.map((c: Json, i: number) => (
        <Card key={i} className="p-3 mb-2 text-xs border-destructive/40">
          <div className="font-bold text-destructive">{c.conflictType} — {c.resourceCode}</div>
          <div>Keep for {c.keepIncident} (risk {c.keepRisk ?? '—'}); release {c.releaseIncident}.</div>
          <div className="text-muted-foreground">{c.recommendation}</div>
        </Card>
      ))}
    </div>
  )
}
// ===== Cascade & Graph tab (features 4 + 9) =====
function CascadeTab({ overview, officer, reload, busy }: Json) {
  return (
    <div className="space-y-3">
      {officer && (
        <Button size="sm" onClick={() => busy(async () => { await apiPost('/api/advanced', { action: 'run-cascade-detection' }); reload() }, 'Cascade detection complete')}>
          Run cascade detection
        </Button>
      )}
      <div>
        <h3 className="text-sm font-bold mb-2">Cascade chains</h3>
        {(overview?.cascade?.chains || []).length === 0 ? <p className="text-xs text-muted-foreground">No cascade links detected among active incidents.</p> :
          (overview?.cascade?.chains || []).map((c: Json, i: number) => (
            <Card key={i} className="p-3 mb-2 text-xs border-amber-500/40">
              <span className="font-bold">{c.from}</span> → <span className="font-bold">{c.to}</span> <Badge variant="outline" className="ml-1 text-[9px]">{c.relation}</Badge>
              <div className="text-muted-foreground mt-1">{c.explanation}</div>
            </Card>
          ))}
      </div>
      <GraphSection />
    </div>
  )
}

function GraphSection() {
  const [graph, setGraph] = useState<Json | null>(null)
  useEffect(() => { apiGet('/api/advanced?feature=graph').then(setGraph).catch(() => {}) }, [])
  if (!graph) return <p className="text-xs text-muted-foreground">Loading relationship graph…</p>
  const idx: Record<string, number> = {}
  graph.nodes.forEach((n: Json, i: number) => { idx[n.id] = i })
  return (
    <div>
      <h3 className="text-sm font-bold mb-2">Incident relationship graph ({graph.nodes.length} nodes, {graph.edges.length} edges)</h3>
      <svg viewBox="0 0 100 62" className="w-full max-w-2xl border rounded-md bg-card">
        {graph.edges.map((e: Json, i: number) => {
          const a = graph.nodes[idx[e.from]], b = graph.nodes[idx[e.to]]
          if (!a || !b) return null
          const x1 = 8 + ((i * 17) % 84), y1 = 8
          const x2 = 8 + ((i * 29 + 13) % 84), y2 = 54
          return <line key={`v${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-muted-foreground" strokeWidth="0.4" opacity="0.5" />
        })}
        {graph.nodes.map((n: Json, i: number) => {
          const col = i % 6, row = Math.floor(i / 6) % 4
          const cx = 10 + col * 16, cy = 10 + row * 14
          const color = n.riskLevel === 'CRITICAL' ? '#dc2626' : n.riskLevel === 'HIGH' ? '#ea580c' : n.riskLevel === 'MEDIUM' ? '#ca8a04' : '#16a34a'
          return (
            <g key={n.id}>
              <circle cx={cx} cy={cy} r="2.4" fill={color}><title>{`${n.code} · ${n.type} · risk ${n.riskScore ?? '—'}`}</title></circle>
              <text x={cx} y={cy - 3.4} fontSize="1.8" textAnchor="middle" className="fill-foreground">{n.code}</text>
            </g>
          )
        })}
      </svg>
      <Note>Node color = risk level. Hover for details. Edges: CASCADES_FROM / SAME_EVENT / DUPLICATE_OF / SHARES_RESOURCES.</Note>
    </div>
  )
}
// ===== Evacuation tab (features 5 + 6) =====
function EvacTab({ incidentId, officer, busy }: Json) {
  const [zones, setZones] = useState<Json[]>([])
  const [corridors, setCorridors] = useState<Json[]>([])
  const load = () => {
    apiGet('/api/advanced?feature=safe-zones').then((r) => setZones(r.zones || [])).catch(() => {})
    apiGet('/api/advanced?feature=corridors').then((r) => setCorridors(r.corridors || [])).catch(() => {})
  }
  useEffect(load, [])
  return (
    <div className="space-y-3">
      {officer && (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" disabled={!incidentId} onClick={() => busy(async () => { await apiPost('/api/advanced', { action: 'generate-safe-zones', incidentId }); load() }, 'Safe zones generated')}>Generate safe zones</Button>
          <Button size="sm" disabled={!incidentId} onClick={() => busy(async () => { await apiPost('/api/advanced', { action: 'plan-corridors', incidentId }); load() }, 'Corridors planned')}>Plan evacuation corridors</Button>
          {!incidentId && <span className="text-xs text-muted-foreground self-center">Select an incident in the Digital Twin tab first.</span>}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-2">
        <div>
          <h3 className="text-sm font-bold mb-2">Safe zones ({zones.length})</h3>
          {zones.map((z) => (
            <Card key={z.id} className="p-3 mb-2 text-xs">
              <div className="font-bold">{z.zoneCode} — {z.name}</div>
              <div className="font-mono text-muted-foreground">{z.type} · capacity {z.capacity} · {z.status} · {z.riskLevel}</div>
            </Card>
          ))}
        </div>
        <div>
          <h3 className="text-sm font-bold mb-2">Evacuation corridors ({corridors.length})</h3>
          {corridors.map((c) => (
            <Card key={c.id} className="p-3 mb-2 text-xs">
              <div className="font-bold">{c.corridorCode} — {c.name}</div>
              <div className="font-mono text-muted-foreground">{c.distanceKm}km · ETA {c.etaMinutes}min · risk {Math.round(c.riskScore)} · {c.status}</div>
            </Card>
          ))}
        </div>
      </div>
      <Note>Corridor paths are straight-line heuristic plans derived from hazard geometry. Road-network routing requires an external routing API.</Note>
    </div>
  )
}
// ===== Logistics tab (features 7 + 8 + 15) =====
function LogisticsTab({ officer, busy }: Json) {
  const [lots, setLots] = useState<Json[]>([])
  const [shipments, setShipments] = useState<Json[]>([])
  const [listings, setListings] = useState<Json[]>([])
  const [form, setForm] = useState({ description: '', origin: '', destination: '' })
  const load = () => {
    apiGet('/api/advanced?feature=expiry').then((r) => setLots(r.lots || [])).catch(() => {})
    apiGet('/api/advanced?feature=shipments').then((r) => setShipments(r.shipments || [])).catch(() => {})
    apiGet('/api/advanced?feature=marketplace').then((r) => setListings(r.listings || [])).catch(() => {})
  }
  useEffect(load, [])
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div>
        <h3 className="text-sm font-bold mb-2">Expiry / spoilage watchlist</h3>
        {lots.map((l) => (
          <Card key={l.id} className="p-3 mb-2 text-xs">
            <div className="font-bold">{l.batchCode} — {l.name}</div>
            <div className="font-mono text-muted-foreground">{l.quantity} {l.unit} · expires {new Date(l.expiresAt).toLocaleDateString()} ({l.daysLeft}d)</div>
            <div className={(l.spoilageRisk ?? 0) >= 70 ? 'text-destructive font-bold' : 'text-muted-foreground'}>risk {Math.round(l.spoilageRisk ?? 0)}% — {l.recommendation}</div>
          </Card>
        ))}
        {officer && <Button size="sm" variant="outline" onClick={() => busy(async () => { await apiPost('/api/advanced', { action: 'scan-expiry' }); load() }, 'Expiry scan complete')}>Re-scan expiry</Button>}
      </div>
      <div>
        <h3 className="text-sm font-bold mb-2">Supply chain shipments</h3>
        {shipments.map((s) => (
          <Card key={s.id} className="p-3 mb-2 text-xs">
            <div className="font-bold">{s.shipmentCode} — {s.description}</div>
            <div className="font-mono text-muted-foreground">{s.origin} → {s.destination} · {s.status} · step {s.currentStep + 1}/6</div>
            <div className="mt-1 flex gap-0.5">{(s.steps || []).map((st: Json, i: number) => (
              <div key={i} className={`h-1.5 flex-1 rounded ${st.done ? 'bg-green-600' : 'bg-muted'}`} title={st.label} />
            ))}</div>
            {officer && s.status !== 'DELIVERED' && (
              <Button size="sm" variant="outline" className="mt-2 h-6 text-[10px]" onClick={() => busy(async () => { await apiPost('/api/advanced', { action: 'advance-shipment', id: s.id }); load() }, 'Shipment advanced')}>Advance step</Button>
            )}
          </Card>
        ))}
        {officer && (
          <div className="space-y-1.5 mt-2">
            <Input className="h-8 text-xs" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="flex gap-1.5">
              <Input className="h-8 text-xs" placeholder="Origin" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
              <Input className="h-8 text-xs" placeholder="Destination" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            </div>
            <Button size="sm" onClick={() => busy(async () => { await apiPost('/api/advanced', { action: 'create-shipment', ...form }); setForm({ description: '', origin: '', destination: '' }); load() }, 'Shipment created')} disabled={!form.description || !form.origin || !form.destination}>Create shipment</Button>
          </div>
        )}
      </div>
      <MarketplaceSection listings={listings} officer={officer} busy={busy} reload={load} />
    </div>
  )
}
function MarketplaceSection({ listings, officer, busy, reload }: Json) {
  const [listing, setListing] = useState({ agencyName: '', resourceType: 'MEDICAL_SUPPLY', quantity: 100, kind: 'OFFER' })
  return (
    <div className="md:col-span-2">
      <h3 className="text-sm font-bold mb-2">Inter-agency marketplace</h3>
      {listings.map((l: Json) => (
        <Card key={l.id} className="p-3 mb-2 text-xs flex items-center gap-3">
          <Badge variant={l.kind === 'OFFER' ? 'default' : 'secondary'} className="text-[9px]">{l.kind}</Badge>
          <div className="flex-1">
            <span className="font-bold">{l.listingCode} · {l.agencyName}</span> — {l.quantity} {l.unit} {String(l.resourceType).replace(/_/g, ' ').toLowerCase()}
          </div>
          <Badge variant="outline" className="text-[9px]">{l.status}</Badge>
        </Card>
      ))}
      {officer && (
        <div className="flex gap-1.5 flex-wrap items-center mt-2">
          <Input className="h-8 text-xs w-36" placeholder="Agency name" value={listing.agencyName} onChange={(e) => setListing({ ...listing, agencyName: e.target.value })} />
          <Input className="h-8 text-xs w-24" type="number" value={listing.quantity} onChange={(e) => setListing({ ...listing, quantity: Number(e.target.value) })} />
          <Select value={listing.resourceType} onValueChange={(v) => setListing({ ...listing, resourceType: v })}>
            <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{['MEDICAL_SUPPLY', 'FOOD_SUPPLY', 'WATER_SUPPLY', 'AMBULANCE', 'RESCUE_TEAM'].map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={listing.kind} onValueChange={(v) => setListing({ ...listing, kind: v })}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="OFFER">OFFER</SelectItem><SelectItem value="REQUEST">REQUEST</SelectItem></SelectContent>
          </Select>
          <Button size="sm" disabled={!listing.agencyName} onClick={() => busy(async () => { await apiPost('/api/advanced', { action: 'create-listing', ...listing }); reload() }, 'Listing created (auto-matched if possible)')}>Post listing</Button>
        </div>
      )}
      <Note>Marketplace matching is deterministic on type + opposite kind; no live agency directory is connected (DEMO integration point).</Note>
    </div>
  )
}
// ===== Missing Persons tab (feature 12) =====
function MissingTab({ officer, busy }: Json) {
  const [rows, setRows] = useState<Json[]>([])
  const [form, setForm] = useState({ fullName: '', age: '', lastSeenLocation: '', description: '', medicalNeeds: false, childOrElder: false })
  const load = () => apiGet('/api/advanced?feature=missing-persons').then((r) => setRows(r.missingPersons || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const report = () => busy(async () => {
    await apiPost('/api/advanced', { action: 'report-missing-person', ...form, age: form.age ? Number(form.age) : undefined })
    setForm({ fullName: '', age: '', lastSeenLocation: '', description: '', medicalNeeds: false, childOrElder: false })
    load()
  }, 'Missing-person report filed')
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="space-y-2">
        <h3 className="text-sm font-bold">Priority-ranked missing persons ({rows.length})</h3>
        {rows.map((m) => (
          <Card key={m.id} className="p-3 text-xs">
            <div className="flex items-center gap-2">
              <Badge variant={(m.priorityScore ?? 0) >= 70 ? 'destructive' : 'secondary'} className="font-mono">P{Math.round(m.priorityScore ?? 0)}</Badge>
              <span className="font-bold">{m.fullName}</span>{m.age ? `, ${m.age}` : ''}
              <Badge variant="outline" className="ml-auto text-[9px]">{m.status}</Badge>
            </div>
            <div className="text-muted-foreground mt-1">Last seen: {m.lastSeenLocation}{m.incidentCode ? ` · linked ${m.incidentCode}` : ''}</div>
            {m.childOrElder && <Badge className="mr-1 text-[9px]">child/elder</Badge>}
            {m.medicalNeeds && <Badge variant="destructive" className="text-[9px]">medical needs</Badge>}
            {officer && m.contact?.phone && <div className="text-muted-foreground mt-1">Contact: {m.contact.name} · {m.contact.phone}</div>}
            {officer && ['OPEN', 'SEARCHING'].includes(m.status) && (
              <div className="flex gap-1 mt-2">
                {['SEARCHING', 'FOUND', 'REUNITED'].map((s) => (
                  <Button key={s} size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => busy(async () => { await apiPatch('/api/advanced', { action: 'update-missing-person', id: m.id, status: s }); load() })}>{s}</Button>
                ))}
              </div>
            )}
          </Card>
        ))}
        {!officer && <Note>Contact details are visible to officers only.</Note>}
      </div>
      <div className="space-y-1.5">
        <h3 className="text-sm font-bold">File a missing-person report</h3>
        <Input className="h-8 text-xs" placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        <div className="flex gap-1.5">
          <Input className="h-8 text-xs" placeholder="Age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          <Input className="h-8 text-xs" placeholder="Last seen location" value={form.lastSeenLocation} onChange={(e) => setForm({ ...form, lastSeenLocation: e.target.value })} />
        </div>
        <Input className="h-8 text-xs" placeholder="Description / clothing / circumstances" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" checked={form.childOrElder} onChange={(e) => setForm({ ...form, childOrElder: e.target.checked })} /> child/elder</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={form.medicalNeeds} onChange={(e) => setForm({ ...form, medicalNeeds: e.target.checked })} /> medical needs</label>
        </div>
        <Button size="sm" disabled={!form.fullName || !form.lastSeenLocation} onClick={report}>File report</Button>
        <Note>Priority score: base + child/elder + medical needs + recency of last-seen. Higher = searched first.</Note>
      </div>
    </div>
  )
}
// ===== Hospitals tab (feature 14) =====
function HospitalsTab({ incidentId }: { incidentId: string }) {
  const [data, setData] = useState<Json | null>(null)
  useEffect(() => {
    apiGet(`/api/advanced?feature=hospitals${incidentId ? `&incidentId=${incidentId}` : ''}`).then(setData).catch(() => {})
  }, [incidentId])
  if (!data) return <p className="text-xs text-muted-foreground">Loading hospital load board…</p>
  return (
    <div className="space-y-2">
      {data.incident && <p className="text-xs font-mono">Ranked for <b>{data.incident}</b> — best transfer destinations first:</p>}
      {data.ranked.map((h: Json) => (
        <Card key={h.id ?? h.name} className="p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold">{h.name}</span>
            <Badge variant={h.status === 'ACCEPTING' ? 'default' : h.status === 'LIMITED' ? 'secondary' : 'destructive'} className="text-[9px]">{h.status}</Badge>
            {h.demo && <Badge variant="outline" className="text-[9px]">DEMO</Badge>}
            {h.matchScore != null && <span className="ml-auto font-mono">match {h.matchScore}</span>}
          </div>
          <div className="font-mono text-muted-foreground mt-1">
            beds {h.availableBeds}/{h.totalBeds} · ICU {h.icuAvailable} · ER load {h.erLoadPct}%
            {h.distanceKm != null && ` · ${h.distanceKm}km · ETA ${h.etaMinutes}min`}
          </div>
          {h.reason && <div className="text-muted-foreground">{h.reason}</div>}
        </Card>
      ))}
      <Note>{data.note}</Note>
    </div>
  )
}

// ===== People Safety tab (features 10 + 13) =====
function PeopleTab() {
  const [workload, setWorkload] = useState<Json[]>([])
  const [crowd, setCrowd] = useState<Json[]>([])
  useEffect(() => {
    apiGet('/api/advanced?feature=workload').then((r) => setWorkload(r.workload || [])).catch(() => {})
    apiGet('/api/advanced?feature=insights').then((r) => setCrowd((r.insights || []).filter((i: Json) => i.feature === 'CROWD_RISK'))).catch(() => {})
  }, [])
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div>
        <h3 className="text-sm font-bold mb-2">Responder workload risk</h3>
        {workload.map((w) => (
          <Card key={w.id} className="p-3 mb-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold">{w.name}</span>
              <Badge variant={w.riskLevel === 'CRITICAL' || w.riskLevel === 'HIGH' ? 'destructive' : w.riskLevel === 'MEDIUM' ? 'secondary' : 'default'} className="ml-auto text-[9px]">{w.riskLevel} {w.riskScore}</Badge>
            </div>
            <div className="font-mono text-muted-foreground">{w.activeAssignments} active · {w.verdict}</div>
          </Card>
        ))}
      </div>
      <div>
        <h3 className="text-sm font-bold mb-2">Crowd movement risk</h3>
        {crowd.map((c: Json) => {
          const p = c.payload || {}
          return (
            <Card key={c.id} className="p-3 mb-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold">{c.incident?.incidentCode ?? 'Incident'}</span>
                <Badge variant="outline" className="text-[9px]">{c.demo ? 'DEMO FACTORS' : 'LIVE'}</Badge>
                <span className="ml-auto font-mono">{p.level} {p.score}</span>
              </div>
              <div className="font-mono text-muted-foreground">surge ~{p.estimatedSurge} · shelter gap {p.shelterGapPct}% · capacity {p.shelterCapacity}</div>
              {(p.drivers || []).map((d: string, i: number) => <div key={i} className="text-muted-foreground">• {d}</div>)}
            </Card>
          )
        })}
        {!crowd.length && <p className="text-xs text-muted-foreground">No crowd-risk insights yet — generated automatically after each AI incident analysis.</p>}
      </div>
    </div>
  )
}
// ===== Evidence & Trust tab (features 16 + 17) =====
function EvidenceTab({ incidentId, officer, busy }: Json) {
  const [insights, setInsights] = useState<Json[]>([])
  const load = () => apiGet('/api/advanced?feature=insights').then((r) => setInsights((r.insights || []).filter((i: Json) => ['INCIDENT_TRUST', 'EVIDENCE'].includes(i.feature)))).catch(() => {})
  useEffect(() => { load() }, [])
  return (
    <div className="space-y-3">
      {officer && (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" disabled={!incidentId} onClick={() => busy(async () => { await apiPost('/api/advanced', { action: 'analyze-evidence', incidentId, modality: 'DRONE' }); load() }, 'Drone evidence analysis complete')}>Analyze drone evidence</Button>
          <Button size="sm" disabled={!incidentId} onClick={() => busy(async () => { await apiPost('/api/advanced', { action: 'analyze-evidence', incidentId, modality: 'SATELLITE' }); load() }, 'Satellite evidence analysis complete')}>Analyze satellite evidence</Button>
        </div>
      )}
      {insights.map((i) => {
        const p = i.payload || {}
        return (
          <Card key={i.id} className="p-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold">{i.feature === 'INCIDENT_TRUST' ? 'Trust score' : `Evidence (${p.modality})`}</span>
              {i.incident?.incidentCode && <span className="font-mono text-muted-foreground">{i.incident.incidentCode}</span>}
              <Badge variant="outline" className="ml-auto text-[9px]">{i.demo ? 'DEMO' : i.source === 'ai' ? 'AI' : 'MODEL'}</Badge>
            </div>
            {i.feature === 'INCIDENT_TRUST' ? (
              <>
                <div className="font-mono mt-1">{p.verdict} — score {p.score}/100</div>
                {(p.signals || []).map((s: Json, k: number) => <div key={k} className={s.met ? 'text-green-600' : 'text-muted-foreground'}>{s.met ? '✓' : '✗'} {s.signal} (+{s.weight})</div>)}
              </>
            ) : (
              <>
                <div className="mt-1 text-muted-foreground">{p.overall_assessment}</div>
                {(p.findings || []).map((f: Json, k: number) => (
                  <div key={k} className="mt-1">• {f.observation} <Badge variant="outline" className="text-[8px]">{f.severity}</Badge></div>
                ))}
              </>
            )}
          </Card>
        )
      })}
      {!insights.length && <p className="text-xs text-muted-foreground">No trust/evidence insights yet — they are generated automatically during AI incident analysis.</p>}
      <Note>AI imagery analysis runs only when imagery metadata + GEMINI_API_KEY are available; otherwise a clearly labelled deterministic digest is produced.</Note>
    </div>
  )
}
// ===== What-If tab (feature 18) =====
function WhatIfTab({ officer, busy }: Json) {
  const [runs, setRuns] = useState<Json[]>([])
  const [result, setResult] = useState<Json | null>(null)
  const [form, setForm] = useState({ scenario: 'FLOOD', magnitude: 7, populationDensity: 'HIGH', resourceReductionPct: 20, roadClosurePct: 30 })
  const load = () => apiGet('/api/advanced?feature=whatif').then((r) => setRuns(r.runs || [])).catch(() => {})
  useEffect(() => { if (officer) load() }, [officer])
  if (!officer) return <p className="text-xs text-muted-foreground">What-If simulation is restricted to officers/admins.</p>
  const run = () => busy(async () => {
    const r = await apiPost('/api/advanced', { action: 'run-whatif', ...form })
    setResult(r); load()
  }, 'What-If run complete')
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <h3 className="text-sm font-bold">Configure scenario</h3>
        <Select value={form.scenario} onValueChange={(v) => setForm({ ...form, scenario: v })}>
          <SelectTrigger className="w-full h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{['FLOOD', 'CYCLONE', 'EARTHQUAKE', 'LANDSLIDE', 'INDUSTRIAL_ACCIDENT'].map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
        </Select>
        <label className="text-xs block">Magnitude: {form.magnitude}/10
          <input type="range" min="1" max="10" value={form.magnitude} className="w-full" onChange={(e) => setForm({ ...form, magnitude: Number(e.target.value) })} />
        </label>
        <label className="text-xs block">Resource reduction: {form.resourceReductionPct}%
          <input type="range" min="0" max="80" value={form.resourceReductionPct} className="w-full" onChange={(e) => setForm({ ...form, resourceReductionPct: Number(e.target.value) })} />
        </label>
        <label className="text-xs block">Road closures: {form.roadClosurePct}%
          <input type="range" min="0" max="100" value={form.roadClosurePct} className="w-full" onChange={(e) => setForm({ ...form, roadClosurePct: Number(e.target.value) })} />
        </label>
        <Select value={form.populationDensity} onValueChange={(v) => setForm({ ...form, populationDensity: v })}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{['LOW', 'MEDIUM', 'HIGH'].map((s) => <SelectItem key={s} value={s}>{s} density</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" onClick={run}>Run simulation</Button>
      </div>
      <div className="space-y-2">
        {result && (
          <Card className="p-3 text-xs">
            <div className="font-bold">Latest result <Badge variant="outline" className="text-[9px]">{result.source === 'ai' ? 'AI BRIEF' : 'MODEL'}</Badge></div>
            <div className="font-mono text-muted-foreground mt-1">
              affected ~{result.projectedPeopleAffected} · response {result.projectedResponseTimeMin}min · need {result.resourcesRequired} units (have {result.effectiveResources}) · gap {result.capacityGapPct}% · risk {result.escalatedRiskLevel}
            </div>
            {result.overwhelmed && <div className="text-destructive font-bold mt-1">⚠ Capacity OVERWHELMED under these assumptions — pre-emptive mutual aid recommended.</div>}
            {result.narrative && <p className="mt-2 whitespace-pre-wrap">{result.narrative}</p>}
            <Note>{result.assumptions}</Note>
          </Card>
        )}
        <h3 className="text-sm font-bold">Past runs ({runs.length})</h3>
        {runs.map((r: Json) => (
          <Card key={r.id} className="p-2 text-[11px] font-mono text-muted-foreground">
            {r.name} · {new Date(r.createdAt).toLocaleString()} {r.results?.overwhelmed ? '· OVERWHELMED' : ''}
          </Card>
        ))}
      </div>
    </div>
  )
}
// ===== Explain & Learn tab (features 19 + 20) =====
function LearnTab({ incidentId, officer, busy }: Json) {
  const [explain, setExplain] = useState<Json | null>(null)
  const [entries, setEntries] = useState<Json[]>([])
  const load = () => {
    if (incidentId) apiGet(`/api/advanced?feature=explain&incidentId=${incidentId}`).then(setExplain).catch(() => setExplain(null))
    apiGet('/api/advanced?feature=learning').then((r) => setEntries(r.entries || [])).catch(() => {})
  }
  useEffect(() => { load() }, [])
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="space-y-2">
        <h3 className="text-sm font-bold">Decision explainability {explain ? `— ${explain.incident.code}` : ''}</h3>
        {!incidentId && <p className="text-xs text-muted-foreground">Select an incident in the Digital Twin tab.</p>}
        {explain && (
          <Card className="p-3 text-xs space-y-2">
            <div className="font-mono">{explain.incident.type} · status {explain.incident.status} · risk {explain.incident.riskScore} ({explain.incident.riskLevel})</div>
            <div><b>AI confidence:</b> {explain.aiAvailable ? `${Math.round((explain.aiConfidence ?? 0) * 100)}% (Gemini)` : 'fallback heuristics used'}</div>
            {explain.riskReasons.length > 0 && <div><b>Risk drivers:</b> {explain.riskReasons.join(' · ')}</div>}
            {explain.recommendation?.reason && <div><b>Resource recommendation:</b> {explain.recommendation.reason} <Badge variant="outline" className="text-[8px]">{explain.recommendation.source === 'ai' ? 'AI' : 'MODEL'}</Badge></div>}
            {explain.trustScore && <div><b>Trust:</b> {explain.trustScore.verdict} ({explain.trustScore.score}/100) — {explain.trustScore.signals.filter((s: Json) => s.met).length} corroborating signals</div>}
            <div>
              <b>Workflow timeline:</b>
              <div className="mt-1 max-h-40 overflow-y-auto font-mono text-[10px]">
                {explain.workflowTimeline.map((e: Json, i: number) => <div key={i}>{new Date(e.at).toLocaleString()} — {e.label}</div>)}
              </div>
            </div>
          </Card>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold">AI learning loop ({entries.length})</h3>
          {officer && <Button size="sm" variant="outline" className="ml-auto" onClick={() => busy(async () => { await apiPost('/api/advanced', { action: 'run-learning-loop' }); load() }, 'Learning loop processed')}>Process resolutions</Button>}
        </div>
        {entries.map((e) => (
          <Card key={e.id} className="p-3 text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[9px]">{e.category}</Badge>
              {e.incident?.incidentCode && <span className="font-mono text-muted-foreground">{e.incident.incidentCode}</span>}
              <span className="ml-auto font-mono text-muted-foreground">conf {Math.round((e.confidence ?? 0) * 100)}%</span>
            </div>
            <div className="mt-1">{e.lesson}</div>
            <div className="text-muted-foreground">→ {e.recommendation}</div>
          </Card>
        ))}
        {!entries.length && <p className="text-xs text-muted-foreground">No lessons yet — entries are generated automatically when incidents are resolved, or on demand.</p>}
      </div>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground mt-2">{children}</p>
}
