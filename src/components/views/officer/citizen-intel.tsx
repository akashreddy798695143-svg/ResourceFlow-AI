'use client'

// Officer Citizen Intel — the command-center view of citizen intelligence:
// AI-prioritized crowd hazards, relief requests, volunteer roster and a
// publish-verified-alert tool. Officer/Admin only (routing enforced in page.tsx
// and requireAuth on the API). Citizen identities are masked at the API level.

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import {
  MapPinOff, Package, HandHeart, BellRing, ShieldCheck, Loader2, RefreshCw,
  Users, CheckCircle2, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const SEV_STYLE: Record<string, string> = {
  CRITICAL: 'bg-sev-CRITICAL/15 text-sev-CRITICAL border-sev-CRITICAL',
  HIGH: 'bg-sev-HIGH/15 text-sev-HIGH border-sev-HIGH',
  MEDIUM: 'bg-sev-MEDIUM/15 text-sev-MEDIUM border-sev-MEDIUM',
  LOW: 'bg-emerald-500/15 text-emerald-600 border-emerald-500',
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-sev-CRITICAL' : score >= 50 ? 'bg-sev-HIGH' : score >= 30 ? 'bg-sev-MEDIUM' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={color} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground">{score}</span>
    </div>
  )
}

interface Hazard {
  id: string; hazardType: string; description: string; location: string
  severity: string; status: string; aiConfidence: number | null
  confirmCount: number; verified: boolean; priorityScore: number
  duplicateOfId: string | null; aiSummary: string | null
  reportedBy: { name: string; phone: string | null }
  createdAt: string
}
interface Relief { id: string; needType: string; status: string; urgency: string; location: string; priorityScore: number; requestedBy: { name: string; phone: string | null } }
interface Volunteer { userId: string; name: string; skills: string; availability: string; verifiedSafe: boolean; status: string }
interface Stats { hazards72h: number; verifiedHazards: number; openRelief: number; safeCheckIns72h: number; sos72h: number; volunteersPending: number; volunteersActive: number }
export function CitizenIntelView() {
  const [hazards, setHazards] = useState<Hazard[]>([])
  const [relief, setRelief] = useState<Relief[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [aTitle, setATitle] = useState('')
  const [aBody, setABody] = useState('')
  const [aSeverity, setASeverity] = useState('MEDIUM')
  const [aArea, setAArea] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ hazards: Hazard[]; reliefRequests: Relief[]; volunteers: Volunteer[]; stats: Stats }>('/api/officer/citizen-intel')
      setHazards(res.hazards)
      setRelief(res.reliefRequests)
      setVolunteers(res.volunteers)
      setStats(res.stats)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (body: any, okMsg: string) => {
    setBusy(true)
    try {
      await apiPost('/api/officer/citizen-intel', body)
      toast.success(okMsg)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const publishAlert = async () => {
    if (!aTitle.trim() || !aBody.trim()) return toast.error('Title and body are required')
    setBusy(true)
    try {
      await apiPost('/api/citizen/verified-alerts', { title: aTitle, body: aBody, severity: aSeverity, area: aArea || undefined })
      toast.success('Verified alert published to all citizens')
      setATitle(''); setABody(''); setAArea('')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Citizen Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-prioritized crowdsourced reports — turns citizen intelligence into actionable response data.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {stats && (
          <>
            <Stat label="Hazards 72h" value={stats.hazards72h} />
            <Stat label="Verified" value={stats.verifiedHazards} />
            <Stat label="Open Relief" value={stats.openRelief} />
            <Stat label="Safe check-ins" value={stats.safeCheckIns72h} />
            <Stat label="One-tap SOS" value={stats.sos72h} />
            <Stat label="Volunteers" value={stats.volunteersActive + stats.volunteersPending} />
          </>
        )}
      </div>
{loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading citizen intelligence…</div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><BellRing className="h-4 w-4" />Publish Verified Alert (shown to all citizens)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input placeholder="Alert title" value={aTitle} onChange={(e) => setATitle(e.target.value)} />
                <Input placeholder="Affected area (optional)" value={aArea} onChange={(e) => setAArea(e.target.value)} />
                <Select value={aSeverity} onValueChange={setASeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Textarea placeholder="Alert body — clear, action-oriented guidance for citizens" value={aBody} onChange={(e) => setABody(e.target.value)} className="min-h-16" />
              <Button onClick={publishAlert} disabled={busy} className="gap-1.5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}Publish
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MapPinOff className="h-4 w-4 text-sev-HIGH" />AI-Prioritized Hazard Reports
                <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={load}><RefreshCw className="h-3 w-3" />Refresh</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hazards.length === 0 ? (
                <p className="py-5 text-center text-xs text-muted-foreground">No open citizen hazard reports.</p>
              ) : (
                <div className="space-y-2">
                  {hazards.map((h) => (
                    <div key={h.id} className="rounded-md border border-border p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className={SEV_STYLE[h.severity]}>{h.hazardType.replace(/_/g, ' ')}</Badge>
                        {h.verified && <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500">VERIFIED</Badge>}
                        {h.duplicateOfId && <Badge variant="outline" className="text-[9px]">MERGED</Badge>}
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Users className="h-3 w-3" />×{h.confirmCount}</span>
                        {h.aiConfidence != null && (
                          <span className="text-[10px] text-muted-foreground font-mono">{Math.round(h.aiConfidence * 100)}% conf</span>
                        )}
                        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">Priority <ScoreBar score={h.priorityScore} /></span>
                      </div>
                      <p className="mt-1 text-sm">{h.aiSummary || h.description}</p>
                      <p className="text-xs text-muted-foreground">{h.location} · by {h.reportedBy.name} {h.reportedBy.phone ? `· ${h.reportedBy.phone}` : ''}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: 'verify_hazard', id: h.id }, 'Hazard verified')} className="gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />Verify
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: 'resolve_hazard', id: h.id }, 'Hazard marked resolved')} className="gap-1">
                          <ShieldCheck className="h-3.5 w-3.5" />Resolve
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ action: 'dismiss_hazard', id: h.id }, 'Hazard dismissed')} className="gap-1 text-destructive">
                          <XCircle className="h-3.5 w-3.5" />Dismiss
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
<div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Package className="h-4 w-4" />Relief Requests</CardTitle></CardHeader>
              <CardContent>
                {relief.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">No open relief requests.</p>
                ) : (
                  <div className="space-y-2">
                    {relief.map((r) => (
                      <div key={r.id} className="rounded-md border border-border p-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline">{r.needType}</Badge>
                          <Badge className={SEV_STYLE[r.urgency]}>{r.status}</Badge>
                          <span className="ml-auto flex items-center gap-1 text-[10px]"><ScoreBar score={r.priorityScore} /></span>
                        </div>
                        <p className="text-sm">{r.location} · by {r.requestedBy.name} {r.requestedBy.phone ? `· ${r.requestedBy.phone}` : ''}</p>
                        <div className="mt-1.5 flex gap-1.5">
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: 'update_relief', id: r.id, status: 'ACKNOWLEDGED' }, 'Relief acknowledged')}>Acknowledge</Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: 'update_relief', id: r.id, status: 'FULFILLED' }, 'Relief fulfilled')}>Fulfill</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><HandHeart className="h-4 w-4" />Volunteer Registry</CardTitle></CardHeader>
              <CardContent>
                {volunteers.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">No volunteer registrations.</p>
                ) : (
                  <div className="space-y-2">
                    {volunteers.map((v) => (
                      <div key={v.userId} className="rounded-md border border-border p-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium">{v.name}</span>
                          {v.verifiedSafe && <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500">SAFE</Badge>}
                          <Badge variant="outline">{v.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Skills: {v.skills} · {v.availability}</p>
                        {v.status === 'PENDING' && (
                          <div className="mt-1.5 flex gap-1.5">
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: 'review_volunteer', userId: v.userId, decision: 'APPROVED' }, 'Volunteer approved')}>Approve</Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ action: 'review_volunteer', userId: v.userId, decision: 'REJECTED' }, 'Volunteer rejected')} className="text-destructive">Reject</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <p className="text-[11px] text-muted-foreground">
        Citizen identities are privacy-masked. All actions are audited. Connected to the incident & resource dispatch systems via the main Command Center.
      </p>
    </div>
  )
}
