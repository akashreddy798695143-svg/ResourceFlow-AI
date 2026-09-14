'use client'
// GAME-CHANGER #8 — AI TASK ASSIGNMENT (officer task board)
//
// Shows the AI-suggested task breakdown for an incident, recommends a resource
// per task, and requires an explicit officer approval before any assignment is
// made operational.
//
// Every AI recommendation is presented as a proposal with a visible Approve
// action — the UI never implies the AI dispatched anything on its own.

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ListChecks, Loader2, Sparkles, CheckCircle2, Clock, Play, Pause,
  AlertTriangle, Package, ThumbsUp, RefreshCw,
} from 'lucide-react'

interface Task {
  id: string
  title: string
  description: string | null
  category: string
  priority: number
  status: 'PENDING' | 'ASSIGNED' | 'ACCEPTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED'
  requiredResourceType: string | null
  assignedResourceId: string | null
  resourceCode: string | null
  resourceName: string | null
  approvedByName: string | null
  blockedReason: string | null
  source: string
  reasoning: string | null
  createdAt: string
}

interface Recommendation {
  recommended: {
    id: string; code: string; name: string; type: string
    distanceKm: number; etaMinutes: number; capacity: number
  } | null
  alternatives: { id: string; code: string; name: string; type: string; distanceKm: number; etaMinutes: number; capacity: number }[]
  reasoning: string
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'border-slate-500/50 bg-slate-500/8 text-slate-300',
  ASSIGNED: 'border-blue-500/50 bg-blue-500/10 text-blue-300',
  ACCEPTED: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
  IN_PROGRESS: 'border-primary/50 bg-primary/10 text-primary',
  BLOCKED: 'border-red-500/60 bg-red-500/12 text-red-300',
  COMPLETED: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
}

const STATUS_ICON: Record<string, any> = {
  PENDING: Clock,
  ASSIGNED: Package,
  ACCEPTED: ThumbsUp,
  IN_PROGRESS: Play,
  BLOCKED: AlertTriangle,
  COMPLETED: CheckCircle2,
}

export function TaskBoard({ incidentId }: { incidentId?: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!incidentId) { setLoading(false); return }
    setError(null)
    try {
      const res = await apiGet<{ tasks: Task[] }>(
        `/api/features?feature=tasks&incidentId=${encodeURIComponent(incidentId)}`
      )
      setTasks(res.tasks)
    } catch (e: any) {
      setError(e?.message || 'Could not load tasks')
    } finally {
      setLoading(false)
    }
  }, [incidentId])

  useEffect(() => { load() }, [load])

  const generate = async () => {
    if (!incidentId) return
    setGenerating(true)
    setError(null)
    try {
      await apiPost('/api/features', { action: 'generate-tasks', incidentId })
      await load()
    } catch (e: any) {
      setError(e?.message || 'Task generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const recommend = async (taskId: string) => {
    setBusyId(taskId)
    setError(null)
    try {
      const rec = await apiPost<Recommendation>('/api/features', { action: 'recommend-task-resource', taskId })
      setRecommendations((prev) => ({ ...prev, [taskId]: rec }))
    } catch (e: any) {
      setError(e?.message || 'Could not generate a recommendation')
    } finally {
      setBusyId(null)
    }
  }

  // The human approval gate — nothing is dispatched without this.
  const approve = async (taskId: string, resourceId: string) => {
    setBusyId(taskId)
    setError(null)
    try {
      await apiPost('/api/features', { action: 'approve-task', taskId, resourceId })
      setRecommendations((prev) => { const n = { ...prev }; delete n[taskId]; return n })
      await load()
    } catch (e: any) {
      setError(e?.message || 'Approval failed')
    } finally {
      setBusyId(null)
    }
  }

  const setStatus = async (taskId: string, status: Task['status']) => {
    setBusyId(taskId)
    try {
      await apiPost('/api/features', { action: 'update-task-status', taskId, status })
      await load()
    } catch (e: any) {
      setError(e?.message || 'Status update failed')
    } finally {
      setBusyId(null)
    }
  }

  if (!incidentId) return null

  const done = tasks.filter((t) => t.status === 'COMPLETED').length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              Response Tasks
              {tasks.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {done}/{tasks.length} done
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              AI proposes the task list and resource mapping. An officer approves before dispatch.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 gap-1 text-[11px]"
            onClick={generate}
            disabled={generating}
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {tasks.length === 0 ? 'Generate tasks' : 'Add more tasks'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {error && (
          <div className="flex items-start gap-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
            <span className="text-muted-foreground">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8">
            <ListChecks className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">No tasks yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generate an AI task breakdown to structure the response.
            </p>
          </div>
        ) : (
          tasks.map((t) => {
            const style = STATUS_STYLE[t.status] ?? STATUS_STYLE.PENDING
            const Icon = STATUS_ICON[t.status] ?? Clock
            const rec = recommendations[t.id]
            const isBusy = busyId === t.id

            return (
              <div key={t.id} className={cn('rounded-lg border p-3', style)}>
                <div className="flex items-start gap-2 flex-wrap mb-1">
                  <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                    P{t.priority}
                  </Badge>
                  <span className="font-semibold text-sm flex-1 min-w-0">{t.title}</span>
                  <Badge variant="outline" className={cn('text-[9px] font-mono gap-1 shrink-0', style)}>
                    <Icon className="h-2.5 w-2.5" /> {t.status.split('_').join(' ')}
                  </Badge>
                  {t.source === 'ai' && (
                    <Badge variant="outline" className="text-[9px] font-mono gap-1 border-primary/40 text-primary shrink-0">
                      <Sparkles className="h-2.5 w-2.5" /> AI
                    </Badge>
                  )}
                </div>

                {t.description && <p className="text-xs opacity-90 leading-snug">{t.description}</p>}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px] font-mono text-muted-foreground">
                  <span>{t.category}</span>
                  {t.resourceCode ? (
                    <span className="text-foreground">→ {t.resourceCode} ({t.resourceName})</span>
                  ) : (
                    <span>→ unassigned</span>
                  )}
                  {t.approvedByName && <span>approved by {t.approvedByName}</span>}
                </div>

                {t.reasoning && (
                  <p className="text-[10px] text-muted-foreground mt-1 italic">{t.reasoning}</p>
                )}

                {t.blockedReason && (
                  <p className="text-[10px] text-red-300 mt-1">Blocked: {t.blockedReason}</p>
                )}

                {/* AI recommendation awaiting officer approval */}
                {rec && (
                  <div className="mt-2 rounded-md border-emerald-500/35 bg-emerald-500/5 p-2.5 space-y-2">
                    {rec.recommended ? (
                      <>
                        <p className="text-[10px] uppercase tracking-wide text-emerald-400">
                          AI recommendation — awaiting your approval
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold">
                            {rec.recommended.code} · {rec.recommended.name}
                          </span>
                          <Badge variant="outline" className="text-[9px] font-mono">
                            {rec.recommended.distanceKm} km · {rec.recommended.etaMinutes} min
                          </Badge>
                          <Badge variant="outline" className="text-[9px] font-mono">
                            cap {rec.recommended.capacity}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{rec.reasoning}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 px-2.5 text-[11px] gap-1"
                            disabled={isBusy}
                            onClick={() => approve(t.id, rec.recommended!.id)}
                          >
                            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            Approve &amp; assign
                          </Button>
                          {rec.alternatives.slice(0, 2).map((alt) => (
                            <Button
                              key={alt.id}
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[10px]"
                              disabled={isBusy}
                              onClick={() => approve(t.id, alt.id)}
                            >
                              Use {alt.code} ({alt.etaMinutes}m)
                            </Button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-amber-400">{rec.reasoning}</p>
                    )}
                  </div>
                )}

                {/* Task actions */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {t.status === 'PENDING' && !rec && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] gap-1"
                      disabled={isBusy}
                      onClick={() => recommend(t.id)}
                    >
                      {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Recommend resource
                    </Button>
                  )}
                  {t.status === 'ASSIGNED' && (
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] gap-1" disabled={isBusy} onClick={() => setStatus(t.id, 'ACCEPTED')}>
                      <ThumbsUp className="h-3 w-3" /> Accept
                    </Button>
                  )}
                  {['ASSIGNED', 'ACCEPTED'].includes(t.status) && (
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] gap-1" disabled={isBusy} onClick={() => setStatus(t.id, 'IN_PROGRESS')}>
                      <Play className="h-3 w-3" /> Start
                    </Button>
                  )}
                  {t.status === 'IN_PROGRESS' && (
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] gap-1" disabled={isBusy} onClick={() => setStatus(t.id, 'BLOCKED')}>
                      <Pause className="h-3 w-3" /> Mark blocked
                    </Button>
                  )}
                  {t.status !== 'COMPLETED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] gap-1 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10"
                      disabled={isBusy}
                      onClick={() => setStatus(t.id, 'COMPLETED')}
                    >
                      <CheckCircle2 className="h-3 w-3" /> Complete
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
