'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from '@/lib/use-router'
import { apiGet, apiPost } from '@/lib/api-client'
import { useRealtimeEvents } from '@/lib/use-realtime'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, XCircle, Inbox } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { RiskBadge } from '@/components/shared/badges'
import type { Approval, DashboardEvent, RiskLevel } from '@/lib/types'

function safeJson(s: string | null): any {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

export function ApprovalsView() {
  const { navigate } = useRouter()
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ approvals: Approval[] }>('/api/approvals?decision=PENDING')
      setApprovals(res.approvals)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeEvents(useCallback((e: DashboardEvent) => {
    if (e.type === 'APPROVAL_REQUIRED' || e.type === 'APPROVAL_GRANTED' || e.type === 'APPROVAL_REJECTED' || e.type === 'NOTIFICATION') load()
  }, [load]))

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setActing(id)
    try {
      await apiPost(`/api/approvals/${id}/${decision}`, { reason: reasons[id] || `${decision}d by officer` })
      toast.success(`Assignment ${decision}d`)
      setReasons((p) => { const n = { ...p }; delete n[id]; return n })
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Approvals Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">Review and approve AI resource recommendations.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : approvals.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No pending approvals.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => {
            const rec = safeJson(a.recommendation)
            const recommended = rec?.recommended_resource
            return (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-primary">{a.incident?.incidentCode}</span>
                    <Badge variant="secondary" className="text-[10px]">{a.incident?.type.replace(/_/g, ' ')}</Badge>
                    {a.incident?.riskLevel && <RiskBadge level={a.incident.riskLevel as RiskLevel} score={a.incident.riskScore} />}
                    <span className="text-xs text-muted-foreground ml-auto">{a.incident?.location}</span>
                  </div>

                  {recommended ? (
                    <div className="mt-3 rounded-md border border-border bg-card/40 p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-emerald-500">{recommended.code}</span>
                        <span className="text-sm font-medium">{recommended.name}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{recommended.reason}</p>
                      <div className="mt-2 flex gap-4 text-xs">
                        <span>ETA: <span className="font-mono">{recommended.eta_minutes} min</span></span>
                        <span>Distance: <span className="font-mono">{recommended.distance_km} km</span></span>
                        <span>Capacity: <span className="font-mono">{recommended.capacity}</span></span>
                      </div>
                      {rec.alternative_resources?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-[10px] text-muted-foreground uppercase mb-1">Alternatives</p>
                          <div className="space-y-1">
                            {rec.alternative_resources.map((alt: any) => (
                              <div key={alt.id} className="text-xs flex items-center justify-between">
                                <span className="font-mono text-muted-foreground">{alt.code} · {alt.name}</span>
                                <span className="text-muted-foreground">{alt.eta_minutes}min · {alt.distance_km}km</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No eligible resource — escalate.</p>
                  )}

                  <Textarea
                    placeholder="Reason / note (optional)"
                    value={reasons[a.id] || ''}
                    onChange={(e) => setReasons((p) => ({ ...p, [a.id]: e.target.value }))}
                    rows={2}
                    className="mt-3"
                  />
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="gap-1.5" onClick={() => decide(a.id, 'approve')} disabled={acting === a.id || !recommended}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => decide(a.id, 'reject')} disabled={acting === a.id}>
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => navigate(`/incidents/${a.incidentId}`)}>
                      Open incident →
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
