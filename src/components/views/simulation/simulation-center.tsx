'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from '@/lib/use-router'
import { apiGet, apiPost } from '@/lib/api-client'
import { useRealtimeEvents } from '@/lib/use-realtime'
import { toast } from 'sonner'
import {
  Loader2, FlaskConical, Play, Activity, TrendingDown, TrendingUp, BarChart3, Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SimulationRun, SimulationEvent, DashboardEvent } from '@/lib/types'

const SCENARIOS = [
  { value: 'FLOOD', label: 'Flood — rising water, low-lying districts' },
  { value: 'CYCLONE', label: 'Cyclone — landfall, high winds' },
  { value: 'EARTHQUAKE', label: 'Earthquake — M6.2 shallow' },
  { value: 'LANDSLIDE', label: 'Landslide — hillside collapse' },
]

const OPTIONS = [
  { key: 'ambulanceUnavailable', label: 'Ambulance unavailable' },
  { key: 'rescueTeamUnavailable', label: 'Rescue team unavailable' },
  { key: 'hospitalCapacityReduced', label: 'Hospital capacity reduced' },
  { key: 'shelterCapacityReduced', label: 'Shelter capacity reduced' },
  { key: 'roadBlocked', label: 'Road blocked' },
  { key: 'responseDelay', label: 'Response delay' },
  { key: 'additionalIncidents', label: 'Additional incidents' },
]

function safeJson(s: string | null): any {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

export function SimulationCenterView() {
  const { navigate } = useRouter()
  const [scenario, setScenario] = useState('FLOOD')
  const [options, setOptions] = useState<Record<string, boolean>>({ roadBlocked: true, ambulanceUnavailable: true, responseDelay: true, additionalIncidents: true })
  const [running, setRunning] = useState(false)
  const [runs, setRuns] = useState<SimulationRun[]>([])
  const [selectedRun, setSelectedRun] = useState<SimulationRun | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ runs: SimulationRun[] }>('/api/simulation/runs')
      setRuns(res.runs)
      if (res.runs.length > 0 && !selectedRun) setSelectedRun(res.runs[0])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedRun])

  useEffect(() => { load() }, [load])
  useRealtimeEvents(useCallback((e: DashboardEvent) => {
    if (e.type.startsWith('SIM_') || e.type === 'SIMULATION_COMPLETED') load()
  }, [load]))

  const run = async () => {
    setRunning(true)
    try {
      const res = await apiPost<{ run: SimulationRun }>('/api/simulation/runs', { scenario, options })
      toast.success('Simulation complete')
      setSelectedRun(res.run)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRunning(false)
    }
  }

  const toggleOption = (key: string) => setOptions((p) => ({ ...p, [key]: !p[key] }))

  const metrics = selectedRun?.metrics ? safeJson(selectedRun.metrics) : null
  const events = selectedRun?.events || []

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><FlaskConical className="h-6 w-6 text-primary" /> Simulation Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run deterministic scenarios in a separate state. <span className="font-semibold">Never modifies real incident data.</span>
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Config */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm">Scenario Configuration</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Scenario</Label>
              <Select value={scenario} onValueChange={setScenario}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCENARIOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Injectable conditions</Label>
              <div className="space-y-2 rounded-md border border-border p-3 bg-card/40">
                {OPTIONS.map((opt) => (
                  <div key={opt.key} className="flex items-center justify-between gap-2">
                    <Label htmlFor={opt.key} className="text-sm cursor-pointer flex-1">{opt.label}</Label>
                    <Switch id={opt.key} checked={!!options[opt.key]} onCheckedChange={() => toggleOption(opt.key)} />
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full gap-1.5" onClick={run} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? 'Running simulation…' : 'Run Simulation'}
            </Button>
            <Badge variant="outline" className="text-[9px] text-sev-HIGH border-sev-HIGH block text-center py-1">
              DEMO / SIMULATION · not real emergency data
            </Badge>
          </CardContent>
        </Card>

        {/* Results: baseline vs resourceflow + timeline */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></CardContent></Card>
          ) : !selectedRun ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Run a simulation to see results.</CardContent></Card>
          ) : (
            <>
              {/* Run picker */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Recent runs:</span>
                {runs.slice(0, 6).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRun(r)}
                    className={`text-xs font-mono px-2 py-1 rounded-md border ${selectedRun?.id === r.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent/40'}`}
                  >
                    {r.scenario} · {r.id.slice(-6)}
                  </button>
                ))}
              </div>

              {/* Metrics comparison */}
              {metrics && (
                <Card>
                  <CardHeader className="pb-2 border-b border-border">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" /> BASELINE vs RESOURCEFLOW
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(metrics).map(([key, m]: any) => (
                        <div key={key} className="rounded-md border border-border bg-card/40 p-3">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                          <div className="mt-1.5 space-y-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Baseline</span>
                              <span className="font-mono">{m.baseline}{m.unit === '%' ? '%' : ''}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-primary font-medium">RF</span>
                              <span className="font-mono text-primary">{m.resourceflow}{m.unit === '%' ? '%' : ''}</span>
                            </div>
                            <div className="flex items-center gap-1 pt-1 border-t border-border">
                              {m.resourceflow < m.baseline ? (
                                <TrendingDown className="h-3 w-3 text-sev-LOW" />
                              ) : m.resourceflow > m.baseline ? (
                                <TrendingUp className="h-3 w-3 text-sev-HIGH" />
                              ) : (
                                <Activity className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {m.unit === 'minutes' ? `${m.baseline - m.resourceflow}min faster` :
                                  m.unit === '%' ? `${m.resourceflow - m.baseline}% utilization` :
                                  `${m.baseline - m.resourceflow} fewer`}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[10px] text-muted-foreground">
                      Metrics calculated from the simulated event chain only — not fabricated percentages.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Sim timeline */}
              <Card>
                <CardHeader className="pb-2 border-b border-border">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> Simulation Timeline
                    <Badge variant="secondary" className="text-[9px]">{events.length} events</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ol className="relative space-y-2 border-l border-border pl-4 ml-2">
                    {events.map((e: SimulationEvent) => {
                      const data = safeJson(e.data)
                      return (
                        <li key={e.id} className="relative">
                          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[9px] font-mono text-primary border-primary/40">T+{e.simTimeMin}</Badge>
                            <Badge variant="secondary" className="text-[9px]">{e.eventType.replace(/_/g, ' ')}</Badge>
                          </div>
                          <p className="mt-0.5 text-xs">{e.label}</p>
                          {data && Object.keys(data).length > 0 && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground/70 font-mono">{JSON.stringify(data)}</p>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
