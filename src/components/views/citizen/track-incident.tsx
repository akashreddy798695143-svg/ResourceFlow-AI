'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from '@/lib/use-router'
import { apiGet } from '@/lib/api-client'
import { toast } from 'sonner'
import { Search, Loader2, MapPin, Clock, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IncidentTypeBadge, StatusBadge } from '@/components/shared/badges'

interface TrackResult {
  incidentCode: string
  type: string
  status: string
  location: string
  reportedAt: string
  updatedAt: string
  escalationLevel: number
  stage: string
  lastUpdate: string
  response: {
    assignedAt: string | null
    acknowledgedAt: string | null
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
  const [error, setError] = useState<string | null>(null)

  const lookup = useCallback(async (c: string) => {
    if (!c.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await apiGet<TrackResult>(`/api/incidents/track?code=${encodeURIComponent(c.trim().toUpperCase())}`)
      setResult(res)
    } catch (e: any) {
      setError(e.message || 'Incident not found')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (queryCode) lookup(queryCode)
  }, [queryCode, lookup])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(`/track-incident?code=${encodeURIComponent(code.trim().toUpperCase())}`)
    lookup(code)
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-1">Track an Incident</h1>
      <p className="text-sm text-muted-foreground mb-4">Enter your incident code (e.g. RF-2026-000001) to see its status.</p>

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
            <CardTitle className="text-base flex items-center justify-between">
              <span className="font-mono text-primary">{result.incidentCode}</span>
              <StatusBadge status={result.status as any} />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <IncidentTypeBadge type={result.type as any} />
              {result.escalationLevel > 0 && (
                <Badge variant="outline" className="text-[9px] text-sev-CRITICAL border-sev-CRITICAL">LEVEL {result.escalationLevel}</Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {result.location}
            </div>

            <div className="rounded-md border border-border bg-card/40 p-3">
              <p className="text-xs font-semibold mb-1">Current stage</p>
              <p className="text-sm">{result.stage}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Reported</p>
                <p className="font-mono">{new Date(result.reportedAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last update</p>
                <p className="font-mono">{new Date(result.lastUpdate).toLocaleString()}</p>
              </div>
            </div>

            {result.response.assignedAt && (
              <div className="rounded-md border border-border bg-card/40 p-3 space-y-1.5">
                <p className="text-xs font-semibold">Response timeline</p>
                <TimelineRow label="Assigned" at={result.response.assignedAt} />
                <TimelineRow label="Acknowledged" at={result.response.acknowledgedAt} />
                <TimelineRow label="On scene" at={result.response.arrivedAt} />
                <TimelineRow label="Resolved" at={result.response.resolvedAt} success />
              </div>
            )}

            {result.status === 'RESOLVED' && (
              <div className="rounded-md border border-sev-LOW bg-sev-LOW/20 p-3 flex items-center gap-2 text-sm text-sev-LOW">
                <CheckCircle2 className="h-4 w-4" /> This incident has been resolved.
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

function TimelineRow({ label, at, success }: { label: string; at: string | null; success?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      {at ? (
        <span className="font-mono">{new Date(at).toLocaleString()}</span>
      ) : success ? (
        <span className="text-muted-foreground/60">—</span>
      ) : (
        <span className="text-muted-foreground/60">pending…</span>
      )}
    </div>
  )
}
