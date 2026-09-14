'use client'
// Officer command-center intelligence strip.
//
// One importable block that mounts the four new commander-facing capabilities
// (30-second briefing, priority queue, bottlenecks, broadcast composer) so the
// existing command-center layout only needs a single insertion point.
//
// The selected incident drives the briefing; the queue and bottleneck panels are
// fleet-wide so the officer never has to open an incident to see the picture.

import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/api-client'
import { SituationBriefCard } from '@/components/features/situation-brief-card'
import { PriorityQueuePanel, BottleneckPanel } from '@/components/features/officer/priority-and-bottleneck-panels'
import { BroadcastComposer } from '@/components/features/officer/broadcast-composer'
import { TaskBoard } from '@/components/features/officer/task-board'
import { CommunicationHealthStrip } from '@/components/features/quick-emergency-actions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Radio, ChevronDown, ChevronUp, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'

interface IncidentOption {
  id: string
  incidentCode: string
  type: string
  location: string
  latitude: number
  longitude: number
  riskLevel: string | null
  riskScore: number | null
}

type TabKey = 'briefing' | 'queue' | 'bottlenecks' | 'comms'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'briefing', label: 'Briefing' },
  { key: 'queue', label: 'Priority Queue' },
  { key: 'bottlenecks', label: 'Bottlenecks' },
  { key: 'comms', label: 'Comms & Broadcast' },
]

export function OfficerIntelStrip({
  selectedIncidentId,
  onOpenIncident,
}: {
  selectedIncidentId?: string | null
  onOpenIncident?: (id: string) => void
}) {
  const [tab, setTab] = useState<TabKey>('briefing')
  const [active, setActive] = useState<IncidentOption[]>([])
  const [chosenId, setChosenId] = useState<string | null>(selectedIncidentId ?? null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  // Follow the command center's selection when it changes.
  useEffect(() => {
    if (selectedIncidentId) setChosenId(selectedIncidentId)
  }, [selectedIncidentId])

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ incidents: IncidentOption[] }>('/api/incidents')
      const open = res.incidents.filter((i) => i && i.id)
      setActive(open)
      setChosenId((prev) => prev ?? open[0]?.id ?? null)
    } catch {
      setActive([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const chosen = active.find((i) => i.id === chosenId) ?? null

  return (
    <div className="px-3 md:px-6 pb-3">
      <Card className="border-primary/25 bg-card/40">
        <CardContent className="p-0">
          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 flex-wrap">
            <LayoutDashboard className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                  tab === t.key
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
                )}
              >
                {t.label}
              </button>
            ))}

            {/* Incident selector — only relevant to the briefing/task tabs */}
            {(tab === 'briefing' || tab === 'comms') && active.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground hidden sm:inline">
                  Incident
                </span>
                <select
                  value={chosenId ?? ''}
                  onChange={(e) => setChosenId(e.target.value)}
                  className="rounded-md border-border bg-background px-2 py-1 text-[11px] font-mono max-w-[190px]"
                >
                  {active.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.incidentCode} · {i.type.split('_').join(' ')}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className={cn(
                'rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent/40',
                active.length === 0 && 'ml-auto',
              )}
              aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>

          {!collapsed && (
            <div className="p-3 space-y-3">
              {loading && active.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading live incident intelligence…
                </div>
              )}

              {tab === 'briefing' && (
                chosenId ? (
                  <div className="grid lg:grid-cols-2 gap-3">
                    <SituationBriefCard incidentId={chosenId} />
                    <TaskBoard incidentId={chosenId} />
                  </div>
                ) : (
                  <EmptyState message="No active incidents to brief." />
                )
              )}

              {tab === 'queue' && <PriorityQueuePanel onOpenIncident={onOpenIncident} />}

              {tab === 'bottlenecks' && <BottleneckPanel onOpenIncident={onOpenIncident} />}

              {tab === 'comms' && (
                <div className="space-y-3">
                  <CommunicationHealthStrip incidentId={chosenId ?? undefined} />
                  <div className="grid lg:grid-cols-2 gap-3">
                    <BroadcastComposer
                      incidentId={chosenId ?? undefined}
                      defaultLat={chosen?.latitude}
                      defaultLng={chosen?.longitude}
                      defaultLocationName={chosen?.location}
                    />
                    {chosen && (
                      <div className="space-y-3">
                        <div className="rounded-lg border-border bg-card/50 p-3">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                            Selected incident
                          </p>
                          <p className="font-mono text-xs text-primary">{chosen.incidentCode}</p>
                          <p className="text-sm font-medium mt-1">{chosen.type.split('_').join(' ')}</p>
                            < p className = "text-xs text-muted-foreground mt-0.5" > { chosen.location }</p>
                          {chosen.riskLevel && (
                            <Badge variant="outline" className="text-[10px] font-mono mt-2">
                              {chosen.riskLevel}
                              {chosen.riskScore != null ? ' · ' + Math.round(chosen.riskScore) + '/100' : ''}
                            </Badge>
                          )}
                        </div>
                        <div className="rounded-lg border-primary/25 bg-primary/5 p-3">
                          <p className="text-[11px] leading-snug">
                            <Radio className="h-3 w-3 inline mr-1 text-primary" />
                            Broadcasts reach only citizens with a recorded location inside the impact radius.
                            Delivery results are reported per recipient and never assumed.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
