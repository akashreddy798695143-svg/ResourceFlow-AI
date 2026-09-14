'use client'
// GAME-CHANGER #3 — EMERGENCY MESSAGE PRIORITY QUEUE (officer view)
// GAME-CHANGER #9 — RESPONSE BOTTLENECK panel (officer view)
//
// Two commander-facing panels that both make the same promise: CRITICAL traffic
// is impossible to miss, and every AI recommendation is paired with an explicit
// human decision (acknowledge / resolve / dismiss).

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ListOrdered, Loader2, RefreshCw, AlertTriangle, MapPin, Users,
  Clock, Sparkles, CheckCircle2, XCircle, Gauge, Wrench, Zap,
} from 'lucide-react'

// ─── Priority queue ───────────────────────

interface QueueItem {
  incidentId: string
  incidentCode: string
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  priorityReason: string
  timeReceived: string
  incident: { type: string; location: string; status: string }
  message: string
  translation: { text: string; targetLang: string; source: string } | null
  peopleAffected: number | null
  requiredAction: string
  needs: string[]
  classificationSource: string
  source: string
}

const PRIORITY_STYLE: Record<string, { card: string; badge: string }> = {
  CRITICAL: { card: 'border-red-500/60 bg-red-500/10', badge: 'border-red-400/60 text-red-300 bg-red-500/15' },
  HIGH: { card: 'border-orange-500/50 bg-orange-500/8', badge: 'border-orange-400/60 text-orange-300 bg-orange-500/12' },
  MEDIUM: { card: 'border-amber-500/40 bg-amber-500/5', badge: 'border-amber-400/60 text-amber-300 bg-amber-500/10' },
  LOW: { card: 'border-slate-500/40 bg-slate-500/5', badge: 'border-slate-400/50 text-slate-300 bg-slate-500/10' },
}

const PRIORITY_FILTERS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

function timeAgo(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const m = Math.floor(secs / 60)
  if (m < 60) return m + 'm ago'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

export function PriorityQueuePanel({ onOpenIncident }: { onOpenIncident?: (id: string) => void }) {
  const [items, setItems] = useState<QueueItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof PRIORITY_FILTERS)[number]>('ALL')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const q = filter === 'ALL' ? '' : `&minPriority=${filter}`
      const res = await apiGet<{ items: QueueItem[]; counts: Record<string, number> }>(
        `/api/features?feature=priority-queue&limit=40${q}`
      )
      setItems(res.items)
      setCounts(res.counts)
    } catch (e: any) {
      setError(e?.message || 'Could not load the priority queue')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
    const t = setInterval(load, 20000)
    return () => clearInterval(t)
  }, [load])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ListOrdered className="h-4 w-4 text-primary" />
              Emergency Message Priority Queue
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Critical communication is always surfaced first.
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-[11px]" onClick={load}>
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>

        {/* Priority counters — the at-a-glance load picture */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFilter(filter === p ? 'ALL' : p)}
              className={cn(
                'rounded-md border px-2 py-1 text-[10px] font-mono font-bold transition-colors',
                filter === p ? PRIORITY_STYLE[p].badge : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              {p} {counts[p] ?? 0}
            </button>
          ))}
          {filter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className="rounded-md border-border px-2 py-1 text-[10px] font-mono text-muted-foreground hover:border-primary/40"
            >
              CLEAR FILTER
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {loading && items.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 text-sm py-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <span className="text-muted-foreground">{error}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500/50 mb-2" />
            <p className="text-sm font-medium">No citizen messages in the queue</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              New reports and one-tap updates will appear here automatically.
            </p>
          </div>
        ) : (
          items.map((m) => {
            const style = PRIORITY_STYLE[m.priority] ?? PRIORITY_STYLE.MEDIUM
            return (
              <div key={m.incidentId + m.timeReceived} className={cn('rounded-lg border p-3', style.card)}>
                <div className="flex items-start gap-2 flex-wrap mb-1.5">
                  <Badge variant="outline" className={cn('text-[9px] font-mono font-bold', style.badge)}>
                    {m.priority}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => onOpenIncident?.(m.incidentId)}
                    className="font-mono text-xs font-semibold text-primary hover:underline"
                  >
                    {m.incidentCode}
                  </button>
                  <Badge variant="outline" className="text-[9px] font-mono">
                    {m.source.split('_').join(' ')}
                  </Badge>
                  {m.classificationSource === 'ai' && (
                    <Badge variant="outline" className="text-[9px] font-mono gap-1 border-primary/40 text-primary">
                      <Sparkles className="h-2.5 w-2.5" /> AI
                    </Badge>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                    {timeAgo(m.timeReceived)}
                  </span>
                </div>

                <p className="text-sm font-medium leading-snug">{m.message}</p>

                {m.translation && m.translation.source === 'ai' && (
                  <p className="text-xs mt-1 pl-2 border-l-2 border-primary/40 text-muted-foreground">
                    <span className="font-semibold text-primary">AI translation:</span> {m.translation.text}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground font-mono">
                  <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{m.incident.location}</span>
                  <span className="flex items-center gap-1"><Gauge className="h-2.5 w-2.5" />{m.incident.type.split('_').join(' ')}</span>
                  {m.peopleAffected != null && (
                    <span className="flex items-center gap-1"><Users className="h-2.5 w-2.5" />{m.peopleAffected} affected</span>
                  )}
                </div>

                <div className="mt-2 rounded-md border-primary/25 bg-background/40 px-2.5 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Required action</p>
                  <p className="text-xs mt-0.5 leading-snug">{m.requiredAction}</p>
                </div>

                {m.priorityReason && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 italic">{m.priorityReason}</p>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

// ─── Response bottleneck panel ────────────────────────────

interface Bottleneck {
  id: string
  incidentId: string
  incidentCode: string | null
  resourceCode: string | null
  kind: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  title: string
  detail: string
  recommendedAction: string
  detectedBy: string
  createdAt: string
}

const SEV_STYLE: Record<string, string> = {
  CRITICAL: 'border-red-500/70 bg-red-500/12 text-red-300',
  HIGH: 'border-orange-500/50 bg-orange-500/10 text-orange-300',
  MEDIUM: 'border-amber-500/40 bg-amber-500/8 text-amber-300',
  LOW: 'border-slate-500/40 bg-slate-500/5 text-slate-300',
}

export function BottleneckPanel({ onOpenIncident }: { onOpenIncident?: (id: string) => void }) {
  const [items, setItems] = useState<Bottleneck[]>([])
  const [loading, setLoading] = useState(true)
  const [sweeping, setSweeping] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await apiGet<{ bottlenecks: Bottleneck[] }>('/api/features?feature=bottlenecks&limit=30')
      setItems(res.bottlenecks)
    } catch (e: any) {
      setError(e?.message || 'Could not load bottlenecks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  // Detection is an explicit officer action (and is also swept server-side).
  const sweep = async () => {
    setSweeping(true)
    try {
      await apiPost('/api/features', { action: 'run-bottleneck-sweep' })
      await load()
    } catch (e: any) {
      setError(e?.message || 'Sweep failed')
    } finally {
      setSweeping(false)
    }
  }

  const decide = async (id: string, decision: 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED') => {
    setBusyId(id)
    try {
      await apiPost('/api/features', { action: 'resolve-bottleneck', bottleneckId: id, decision })
      setItems((prev) => prev.filter((b) => b.id !== id))
    } catch (e: any) {
      setError(e?.message || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-amber-400" />
              Response Bottlenecks
              {items.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-mono border-amber-500/50 text-amber-300">
                  {items.length} OPEN
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              AI detects problems and recommends a fix — an officer decides.
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-[11px]" onClick={sweep} disabled={sweeping}>
            {sweeping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Run detection
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {loading && items.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Analysing active incidents…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 text-sm py-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <span className="text-muted-foreground">{error}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500/50 mb-2" />
            <p className="text-sm font-medium">No response bottlenecks detected</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Active responses are progressing within normal thresholds.
            </p>
          </div>
        ) : (
          items.map((b) => {
            const style = SEV_STYLE[b.severity] ?? SEV_STYLE.MEDIUM
            return (
              <div key={b.id} className={cn('rounded-lg border p-3', style)}>
                <div className="flex items-start gap-2 flex-wrap mb-1.5">
                  <Badge variant="outline" className={cn('text-[9px] font-mono font-bold', style)}>
                    <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                    {b.severity}
                  </Badge>
                  <span className="font-semibold text-sm">{b.title}</span>
                  {b.incidentCode && (
                    <button
                      type="button"
                      onClick={() => onOpenIncident?.(b.incidentId)}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {b.incidentCode}
                    </button>
                  )}
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                    {b.detectedBy === 'ai' ? 'AI' : 'SYSTEM'} · {timeAgo(b.createdAt)}
                  </span>
                </div>

                <p className="text-xs leading-snug opacity-95">{b.detail}</p>

                <div className="mt-2 rounded-md border-emerald-500/35 bg-emerald-500/5 px-2.5 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-400">Recommended action</p>
                  <p className="text-xs mt-0.5 leading-snug">{b.recommendedAction}</p>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-[11px] gap-1"
                    disabled={busyId === b.id}
                    onClick={() => decide(b.id, 'ACKNOWLEDGED')}
                  >
                    {busyId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
                    Acknowledge
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-[11px] gap-1 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10"
                    disabled={busyId === b.id}
                    onClick={() => decide(b.id, 'RESOLVED')}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Mark resolved
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2.5 text-[11px] gap-1 text-muted-foreground"
                    disabled={busyId === b.id}
                    onClick={() => decide(b.id, 'DISMISSED')}
                  >
                    <XCircle className="h-3 w-3" /> Dismiss
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
