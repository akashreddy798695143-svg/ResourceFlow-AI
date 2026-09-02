'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from '@/lib/use-router'
import { apiGet } from '@/lib/api-client'
import { useRealtimeEvents } from '@/lib/use-realtime'
import { toast } from 'sonner'
import {
  Search, Loader2, MapPin, Clock, CheckCircle2, RefreshCw, Circle, AlertTriangle, Mail,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IncidentTypeBadge, StatusBadge } from '@/components/shared/badges'
import { cn } from '@/lib/utils'

interface Stage {
  key: string
  label: string
  done: boolean
  active: boolean
  at?: string
  message?: string
}

interface TrackResult {
  incidentCode: string
  type: string
  status: string
  location: string
  reportedAt: string
  updatedAt: string
  escalationLevel: number
  currentStage: string
  publicMessage: string
  stages: Stage[]
  lastUpdate: string
  reportEmail: {
    sent: boolean
    status: string  // PENDING | SENT | FAILED
    sentAt: string | null
  } | null
  response: {
    assignedAt: string | null
    acknowledgedAt: string | null
    startedAt: string | null
    arrivedAt: string | null
    resolvedAt: string | null
  }
}

export function TrackIncidentView() {
  const { path, navigate } = useRouter()
  const queryCode = new URLSearchParams(path.split('?')[1] || '').get('code') || ''
  const [code, setCode] = useState(queryCode)
  const [result, setResult] = useState<TrackResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lookup = useCallback(async (c: string, silent = false) => {
    if (!c.trim()) return
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const res = await apiGet<TrackResult>(`/api/incidents/track?code=${encodeURIComponent(c.trim().toUpperCase())}`)
      setResult(res)
    } catch (e: any) {
      if (!silent) setResult(null)
      setError(e.message || 'Incident not found')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial load when code is in the URL
  useEffect(() => {
    if (queryCode) lookup(queryCode)
  }, [queryCode, lookup])

  // Real-time: if any INCIDENT_* or RESOURCE_ASSIGNED or APPROVAL_GRANTED or INCIDENT_STATUS_UPDATED event
  // arrives for this incident, refetch its current status. The fallback auto-refetch also runs every 15s
  // in case WebSocket is unavailable.
  useRealtimeEvents(
    useCallback(
      (e: any) => {
        if (!result) return
        const evIncidentId = e.incidentId || e.data?.incidentId
        const evIncidentCode = e.data?.incident_id || e.data?.incidentCode
        const matchesThis =
          (evIncidentId && evIncidentId === result.incidentCode) ||
          (evIncidentCode && evIncidentCode === result.incidentCode)
        if (
          matchesThis ||
          e.type.startsWith('INCIDENT') ||
          e.type === 'RESOURCE_ASSIGNED' ||
          e.type === 'APPROVAL_GRANTED' ||
          e.type === 'APPROVAL_REJECTED' ||
          e.type === 'REASSIGNMENT' ||
          e.type === 'RESPONSE_ACKNOWLEDGED' ||
          e.type === 'RESPONSE_STARTED' ||
          e.type === 'RESPONSE_ARRIVED'
        ) {
          // Refetch current status — never trust cached state
          lookup(result.incidentCode, true)
        }
      },
      [result, lookup]
    )
  )

  // Fallback: if WebSocket is unavailable, auto-refetch every 15s so the citizen still sees updates.
  useEffect(() => {
    if (!result) return
    const interval = setInterval(() => {
      lookup(result.incidentCode, true)
    }, 15000)
    return () => clearInterval(interval)
  }, [result, lookup])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    navigate(`/track-incident?code=${encodeURIComponent(c)}`)
    lookup(c)
  }

  const refresh = () => {
    if (result) lookup(result.incidentCode, true)
    toast.success('Status refreshed')
  }

  const isDelayedOrEscalated = result?.status === 'DELAYED' || result?.status === 'ESCALATED'

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-1">Track an Incident</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Enter your incident code (e.g. RF-2026-000001) to see its current status. Updates live.
      </p>

      <form onSubmit={submit} className="flex gap-2 mb-4">
        <Input placeholder="RF-2026-000001" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button type="submit" disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Track
        </Button>
      </form>

      {error && (
        <Card className="border-sev-CRITICAL">
          <CardContent className="p-4 text-sm text-sev-CRITICAL">{error}</CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
              <span className="font-mono text-primary">{result.incidentCode}</span>
              <div className="flex items-center gap-2">
                <StatusBadge status={result.status as any} />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 gap-1"
                  onClick={refresh}
                  disabled={refreshing}
                  aria-label="Refresh status"
                >
                  {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <IncidentTypeBadge type={result.type as any} />
              {result.escalationLevel > 0 && (
                <Badge variant="outline" className="text-[9px] text-sev-CRITICAL border-sev-CRITICAL">
                  LEVEL {result.escalationLevel}
                </Badge>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
              </span>
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {result.location}
            </div>

            {/* Public message — the citizen-facing status line */}
            <div
              className={cn(
                'rounded-md border p-3 flex items-start gap-2',
                result.status === 'RESOLVED'
                  ? 'border-sev-LOW bg-sev-LOW/20 text-sev-LOW'
                  : isDelayedOrEscalated
                  ? 'border-sev-CRITICAL bg-sev-CRITICAL/20 text-sev-CRITICAL'
                  : 'border-primary/40 bg-primary/10 text-foreground'
              )}
            >
              {result.status === 'RESOLVED' ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              ) : isDelayedOrEscalated ? (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              ) : null}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Current stage</p>
                <p className="text-sm font-medium">{result.currentStage}</p>
                <p className="text-xs mt-0.5">{result.publicMessage}</p>
              </div>
            </div>

            {/* Visual stage timeline (✓ / ○) */}
            <div>
              <p className="text-xs font-semibold mb-2">Response Timeline</p>
              <ol className="space-y-1.5">
                {result.stages.map((s, i) => (
                  <li key={s.key} className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center shrink-0">
                      {s.done ? (
                        <CheckCircle2
                          className={cn(
                            'h-5 w-5',
                            s.active && isDelayedOrEscalated ? 'text-sev-CRITICAL' : 'text-sev-LOW'
                          )}
                        />
                      ) : s.active ? (
                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-sm',
                          s.done ? 'text-foreground' : s.active ? 'text-primary font-medium' : 'text-muted-foreground/60'
                        )}
                      >
                        {s.done ? '✓ ' : s.active ? '○ ' : '○ '}
                        {s.label}
                      </p>
                      {s.at && s.done && (
                        <p className="text-[10px] text-muted-foreground font-mono">{new Date(s.at).toLocaleString()}</p>
                      )}
                    </div>
                    {i < result.stages.length - 1 && (
                      <div className="absolute left-[9px] mt-5 h-3 w-px bg-border" aria-hidden />
                    )}
                  </li>
                ))}
              </ol>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
              <div>
                <p className="text-muted-foreground">Reported</p>
                <p className="font-mono">{new Date(result.reportedAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last update</p>
                <p className="font-mono">{new Date(result.lastUpdate).toLocaleString()}</p>
              </div>
            </div>

            {result.status === 'RESOLVED' && (
              <div className="rounded-md border border-sev-LOW bg-sev-LOW/20 p-3 flex items-center gap-2 text-sm text-sev-LOW">
                <CheckCircle2 className="h-4 w-4" /> This incident has been resolved.
              </div>
            )}

            {/* Final report email status — citizen-facing */}
            {result.status === 'RESOLVED' && result.reportEmail && (
              <div className="rounded-md border border-border bg-card/40 p-3 space-y-1.5">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  Final Report Email
                </p>
                {result.reportEmail.status === 'SENT' ? (
                  <p className="text-xs text-sev-LOW flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" />
                    Final report sent to your registered email.
                    {result.reportEmail.sentAt && (
                      <span className="text-muted-foreground font-mono ml-1">
                        {new Date(result.reportEmail.sentAt).toLocaleString()}
                      </span>
                    )}
                  </p>
                ) : result.reportEmail.status === 'FAILED' ? (
                  <p className="text-xs text-sev-MEDIUM flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Report generated — email delivery pending. The team will send your report shortly.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Sending final report to your email…
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!error && !result && !loading && (
        <div className="text-center text-sm text-muted-foreground py-8">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Enter an incident code above to track its status.
        </div>
      )}
    </div>
  )
}
