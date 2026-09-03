'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from '@/lib/use-router'
import { apiGet, apiPost } from '@/lib/api-client'
import { useRealtimeEvents } from '@/lib/use-realtime'
import { toast } from 'sonner'
import {
  RadioTower, ShieldAlert, Package, CheckSquare, AlertTriangle,
  Clock, TrendingUp, Activity, ArrowRight, MapPin, Bot, Loader2, Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { Incident, Resource, Approval, Analytics, DashboardEvent, IncidentStatus, RiskLevel } from '@/lib/types'
import { StatusBadge, RiskBadge, IncidentTypeBadge } from '@/components/shared/badges'
import { CommandMap } from '@/components/shared/command-map'

export function CommandCenterView() {
  const { navigate } = useRouter()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [demoRunning, setDemoRunning] = useState(false)
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null)
  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [riskFilter, setRiskFilter] = useState<string>('ALL')

  const loadAll = useCallback(async () => {
    try {
      const [inc, res, appr, ana] = await Promise.all([
        apiGet<{ incidents: Incident[] }>('/api/incidents?limit=200'),
        apiGet<{ resources: Resource[] }>('/api/resources'),
        apiGet<{ approvals: Approval[] }>('/api/approvals?decision=PENDING'),
        apiGet<Analytics>('/api/analytics').catch(() => null),
      ])
      setIncidents(inc.incidents)
      setResources(res.resources)
      setApprovals(appr.approvals)
      if (ana) setAnalytics(ana)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => { loadAll() }, [loadAll])

  // Realtime: refresh on any incident/approval/resource event
  const handleEvent = useCallback((e: DashboardEvent) => {
    if (
      e.type.startsWith('INCIDENT') ||
      e.type === 'APPROVAL_REQUIRED' ||
      e.type === 'APPROVAL_GRANTED' ||
      e.type === 'RESOURCE_ASSIGNED' ||
      e.type === 'RESOURCE_UNAVAILABLE' ||
      e.type === 'NOTIFICATION' ||
      e.type === 'RISK_CALCULATED' ||
      e.type === 'DEMO_STEP'
    ) {
      loadAll()
    }
  }, [loadAll])
  const { events, connected } = useRealtimeEvents(handleEvent)

  const runDemo = async () => {
    setDemoRunning(true)
    const id = toast.loading('Running full end-to-end demo…')
    try {
      const res = await apiPost<{ incidentCode: string; simRunId: string; steps: any[] }>('/api/demo/run')
      toast.success(`Demo complete · ${res.incidentCode}`, { id, description: `${res.steps.length} steps executed` })
      navigate(`/incidents/${res.incidentId ?? ''}`)
    } catch (e: any) {
      toast.error(e.message, { id })
    } finally {
      setDemoRunning(false)
    }
  }

  // Apply filters
  const filteredIncidents = incidents.filter((i) => {
    if (typeFilter !== 'ALL' && i.type !== typeFilter) return false
    if (riskFilter !== 'ALL' && i.riskLevel !== riskFilter) return false
    return true
  })

  // Priority queue: highest risk first, only active incidents (from filtered set)
  const priorityQueue = filteredIncidents
    .filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status))
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
    .slice(0, 12)

  const stats = analytics || {
    totalIncidents: incidents.length,
    criticalIncidents: incidents.filter((i) => i.riskLevel === 'CRITICAL').length,
    activeIncidents: incidents.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status)).length,
    availableResources: resources.filter((r) => r.status === 'AVAILABLE').length,
    assignedResources: resources.filter((r) => ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE'].includes(r.status)).length,
    delayedResponses: incidents.filter((i) => i.status === 'DELAYED').length,
    escalatedIncidents: incidents.filter((i) => i.status === 'ESCALATED').length,
    avgResponseTimeMin: 0, avgResolutionTimeMin: 0, resourceConflicts: 0,
    resourceUtilizationPct: 0, pendingApprovals: approvals.length, unavailableResources: 0,
    resolvedIncidents: incidents.filter((i) => i.status === 'RESOLVED').length,
    timeline: [], byType: {}, byStatus: {}, riskBreakdown: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="border-b border-border bg-card/40 px-4 md:px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <RadioTower className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">Disaster Command Center</h1>
            <Badge variant="outline" className={cn('text-[10px] gap-1', connected ? 'border-sev-LOW text-sev-LOW' : 'border-sev-CRITICAL text-sev-CRITICAL')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500')} />
              {connected ? 'LIVE' : 'RECONNECT'}
            </Badge>
          </div>
          <Button size="sm" className="ml-auto gap-1.5" onClick={runDemo} disabled={demoRunning}>
            {demoRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {demoRunning ? 'Running demo…' : 'Run Hackathon Demo'}
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 p-3 md:px-6">
        <KPI label="Total" value={stats.totalIncidents} icon={ShieldAlert} />
        <KPI label="Critical" value={stats.criticalIncidents} icon={AlertTriangle} tone="CRITICAL" />
        <KPI label="Active" value={stats.activeIncidents} icon={Activity} tone="HIGH" />
        <KPI label="Avail. Resources" value={stats.availableResources} icon={Package} tone="LOW" />
        <KPI label="Assigned" value={stats.assignedResources} icon={CheckSquare} tone="MEDIUM" />
        <KPI label="Delayed" value={stats.delayedResponses} icon={Clock} tone="CRITICAL" />
        <KPI label="Escalated" value={stats.escalatedIncidents} icon={TrendingUp} tone="CRITICAL" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-3 md:px-6 pb-2">
        <KPI label="Avg Response (min)" value={stats.avgResponseTimeMin} icon={Clock} />
        <KPI label="Avg Resolution (min)" value={stats.avgResolutionTimeMin} icon={Clock} />
        <KPI label="Resource Conflicts" value={stats.resourceConflicts} icon={AlertTriangle} tone="HIGH" />
        <KPI label="Pending Approvals" value={stats.pendingApprovals} icon={CheckSquare} tone="HIGH" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 md:px-6 pb-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground uppercase font-medium">Type:</span>
        {['ALL', 'FLOOD', 'EARTHQUAKE', 'FIRE', 'MEDICAL', 'LANDSLIDE', 'CYCLONE', 'ROAD_BLOCKAGE', 'INFRASTRUCTURE', 'OTHER'].map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={cn('text-[10px] px-2 py-0.5 rounded-md border transition', typeFilter === t ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-accent/40')}
          >
            {t === 'ALL' ? 'All' : t.replace(/_/g, ' ')}
          </button>
        ))}
        <span className="text-[10px] text-muted-foreground uppercase font-medium ml-2">Risk:</span>
        {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((r) => (
          <button
            key={r}
            onClick={() => setRiskFilter(r)}
            className={cn('text-[10px] px-2 py-0.5 rounded-md border transition', riskFilter === r ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-accent/40')}
          >
            {r === 'ALL' ? 'All' : r}
          </button>
        ))}
      </div>

      {/* Main grid: map (left, big) + side panel (right) */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-3 gap-3 px-3 md:px-6 pb-3">
        <div className="lg:col-span-2 min-h-[400px] lg:min-h-0 rounded-lg border border-border overflow-hidden bg-card">
          <CommandMap
            incidents={filteredIncidents}
            resources={resources}
            selectedIncident={selectedIncident}
            onSelectIncident={(id) => setSelectedIncident(id)}
            onOpenIncident={(id) => navigate(`/incidents/${id}`)}
          />
        </div>

        {/* Side panel: priority queue + AI recs */}
        <div className="lg:col-span-1 flex flex-col gap-3 min-h-0">
          <Card className="flex-1 min-h-0 flex flex-col">
            <CardHeader className="py-3 px-4 border-b border-border">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Priority Queue</span>
                <Badge variant="secondary" className="text-[10px]">{priorityQueue.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0">
              <ScrollArea className="h-full max-h-[calc(100vh-340px)] rf-scroll">
                {loading ? (
                  <div className="p-4 text-xs text-muted-foreground">Loading…</div>
                ) : priorityQueue.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">No active incidents</div>
                ) : (
                  <div className="divide-y divide-border">
                    {priorityQueue.map((inc) => (
                      <button
                        key={inc.id}
                        onClick={() => navigate(`/incidents/${inc.id}`)}
                        className={cn(
                          'w-full text-left p-3 hover:bg-accent/40 transition group',
                          selectedIncident === inc.id && 'bg-primary/10'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-primary">{inc.incidentCode}</span>
                          {inc.riskLevel && <RiskBadge level={inc.riskLevel as RiskLevel} score={inc.riskScore ?? undefined} />}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <IncidentTypeBadge type={inc.type} />
                          <StatusBadge status={inc.status as IncidentStatus} />
                          {inc.duplicateFlag && <Badge variant="outline" className="text-[9px] text-sev-MEDIUM border-sev-MEDIUM">DUP</Badge>}
                          {inc.escalationLevel > 0 && <Badge variant="outline" className="text-[9px] text-sev-CRITICAL border-sev-CRITICAL">L{inc.escalationLevel}</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{inc.description}</p>
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/70">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{inc.location}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Pending approvals */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-border">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> AI Recommendations</span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => navigate('/approvals')}>
                  View all <ArrowRight className="h-3 w-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-56 rf-scroll">
                {approvals.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">No pending approvals</div>
                ) : (
                  <div className="divide-y divide-border">
                    {approvals.slice(0, 5).map((a) => {
                      const rec = (() => { try { return JSON.parse(a.recommendation) } catch { return null } })()
                      const recommended = rec?.recommended_resource
                      return (
                        <div key={a.id} className="p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs text-primary">{a.incident?.incidentCode}</span>
                            <RiskBadge level={a.incident?.riskLevel as RiskLevel} score={a.incident?.riskScore} />
                          </div>
                          {recommended ? (
                            <div className="mt-1 text-xs">
                              <span className="text-muted-foreground">Recommend: </span>
                              <span className="font-medium">{recommended.code} · {recommended.name}</span>
                              <span className="text-muted-foreground"> · ETA {recommended.eta_minutes}min</span>
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">No eligible resource — escalation needed</p>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px] text-sev-HIGH border-sev-HIGH">
                              APPROVAL REQUIRED
                            </Badge>
                            <Button
                              size="sm" variant="ghost"
                              className="h-6 px-2 text-[10px] ml-auto"
                              onClick={() => navigate('/approvals')}
                            >
                              Review
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Live event timeline */}
      <div className="border-t border-border bg-card/40 px-3 md:px-6 py-3">
        <Card>
          <CardHeader className="py-2 px-4 border-b border-border">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Live Event Timeline
              <Badge variant="outline" className="text-[9px] font-mono">{events.length} events</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-32 rf-scroll">
              {events.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Awaiting real-time events…</div>
              ) : (
                <div className="flex gap-2 p-2 overflow-x-auto">
                  {[...events].reverse().slice(0, 40).map((e, i) => (
                    <div key={i} className="shrink-0 max-w-xs rounded-md border border-border bg-background/60 p-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px] font-mono text-primary border-primary/40">
                          {e.type.replace(/^(SIM_|DEMO_)/, '')}
                        </Badge>
                        <span className="text-[9px] text-muted-foreground font-mono ml-auto">
                          {new Date(e.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2">{e.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KPI({ label, value, icon: Icon, tone = 'default' }: { label: string; value: number; icon: any; tone?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'default' }) {
  const toneClass =
    tone === 'CRITICAL' ? 'text-sev-CRITICAL' :
    tone === 'HIGH' ? 'text-sev-HIGH' :
    tone === 'MEDIUM' ? 'text-sev-MEDIUM' :
    tone === 'LOW' ? 'text-sev-LOW' :
    'text-foreground'
  return (
    <div className="rounded-md border border-border bg-card/50 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={cn('h-3.5 w-3.5', toneClass)} />
      </div>
      <div className={cn('mt-1 text-xl font-bold tabular-nums', toneClass)}>{value}</div>
    </div>
  )
}
