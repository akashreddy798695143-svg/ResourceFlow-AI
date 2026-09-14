'use client'
// GAME-CHANGER #4 — AI SITUATION BRIEF
// GAME-CHANGER #10 — 30-SECOND COMMAND BRIEFING
//
// Two presentations of the same backend brief:
//   • citizenView — a short, plain-language "what is happening" summary
//   • officer     — the full field-by-field briefing card readable in ~30s
//
// The AI badge is only shown when the backend reports source:'ai'. A derived
// brief is labelled honestly, so an officer always knows what they are reading.

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Sparkles, Loader2, RefreshCw, AlertTriangle, Bot, Clock, MapPin,
  Users, Package, Route, Radio, Activity, ThumbsUp, ShieldAlert, FileText,
} from 'lucide-react'

interface BriefFields {
  incident: string
  location: string
  severity: string
  peopleAffected: string
  currentNeeds: string[]
  assignedResources: string[]
  responderEta: string
  roadStatus: string
  communicationStatus: string
  latestUpdate: string
  currentBlocker: string
  aiRecommendation: string
}

interface Brief {
  incidentId: string
  incidentCode: string
  summary: string
  narrative?: string
  fields: Partial<BriefFields>
  source: 'ai' | 'derived'
  modelNote?: string
  generatedAt: string
  cached?: boolean
}

export function SituationBriefCard({
  incidentId,
  citizenView = false,
}: {
  incidentId?: string
  citizenView?: boolean
}) {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!incidentId) { setLoading(false); return }
    setError(null)
    try {
      const res = await apiGet<Brief>(`/api/features?feature=brief&incidentId=${encodeURIComponent(incidentId)}`)
      setBrief(res)
    } catch (e: any) {
      setError(e?.message || 'Briefing unavailable')
    } finally {
      setLoading(false)
    }
  }, [incidentId])

  useEffect(() => { load() }, [load])

  const refresh = async () => {
    if (!incidentId) return
    setRefreshing(true)
    try {
      const res = await apiPost<Brief>('/api/features', { action: 'refresh-brief', incidentId })
      setBrief(res)
    } catch (e: any) {
      setError(e?.message || 'Could not refresh the briefing')
    } finally {
      setRefreshing(false)
    }
  }

  if (!incidentId) return null

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating situation brief…
        </CardContent>
      </Card>
    )
  }

  if (error || !brief) {
    return (
      <Card>
        <CardContent className="p-4 flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Situation brief unavailable</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {error || 'The briefing could not be generated.'} Officer review of the raw incident
              record is still available.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const f = brief.fields || {}

  // ── Citizen presentation: short and reassuring, no internal reasoning ──
  if (citizenView) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            What is happening
            {brief.source === 'ai' && (
              <Badge variant="outline" className="text-[9px] font-mono gap-1">
                <Sparkles className="h-2.5 w-2.5" /> AI SUMMARY
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm leading-relaxed">{brief.summary}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            {f.responderEta && (
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {f.responderEta}</span>
            )}
            {f.location && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {f.location}</span>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Officer presentation: the 30-second command briefing ──
  const rows: { icon: any; label: string; value: React.ReactNode; tone?: 'warn' | 'ok' }[] = [
    { icon: ShieldAlert, label: 'Severity', value: f.severity ?? 'Unknown' },
    { icon: Users, label: 'People affected', value: f.peopleAffected ?? 'Unknown' },
    {
      icon: Package,
      label: 'Assigned resources',
      value: (f.assignedResources ?? []).join(', ') || 'None assigned',
      tone: (f.assignedResources ?? []).length === 0 ? 'warn' : 'ok',
    },
    { icon: Clock, label: 'Responder ETA', value: f.responderEta ?? 'Unavailable' },
    {
      icon: Route,
      label: 'Road status',
      value: f.roadStatus ?? 'Unknown',
      tone: (f.roadStatus ?? '').toLowerCase().includes('blocked') ? 'warn' : undefined,
    },
    {
      icon: Radio,
      label: 'Communication',
      value: f.communicationStatus ?? 'Unknown',
      tone: (f.communicationStatus ?? '').toUpperCase().startsWith('LIVE') ? 'ok' : 'warn',
    },
  ]

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            30-Second Command Briefing
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {brief.source === 'ai' ? (
              <Badge variant="outline" className="text-[9px] font-mono gap-1 border-primary/40 text-primary">
                <Bot className="h-2.5 w-2.5" /> AI BRIEF
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[9px] font-mono gap-1 border-amber-500/40 text-amber-400">
                DERIVED
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 gap-1 text-[11px]"
              onClick={refresh}
              disabled={refreshing}
            >
              {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Headline summary */}
        <div className="rounded-md border-primary/25 bg-primary/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            {brief.incidentCode} · {f.incident ?? 'Incident'}
          </p>
          <p className="text-sm leading-relaxed">{brief.summary}</p>
        </div>

        {/* The scannable field grid */}
        <div className="grid sm:grid-cols-2 gap-2">
          {rows.map((r) => (
            <div
              key={r.label}
              className={cn(
                'rounded-md border p-2.5',
                r.tone === 'warn'
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : r.tone === 'ok'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-border bg-card/50',
              )}
            >
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <r.icon className="h-2.5 w-2.5" /> {r.label}
              </p>
              <p className="text-xs font-medium mt-1 leading-snug">{r.value}</p>
            </div>
          ))}
        </div>

        {/* Needs */}
        {f.currentNeeds && f.currentNeeds.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Current needs</p>
            <div className="flex flex-wrap gap-1.5">
              {f.currentNeeds.slice(0, 8).map((n, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] font-normal">{n}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Latest update + blocker */}
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="rounded-md border-border bg-card/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Latest update</p>
            <p className="text-xs mt-1 leading-snug">{f.latestUpdate ?? 'No updates recorded'}</p>
          </div>
          <div
            className={cn(
              'rounded-md border p-2.5',
              (f.currentBlocker ?? 'None detected') === 'None detected'
                ? 'border-border bg-card/50'
                : 'border-red-500/40 bg-red-500/5',
            )}
          >
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Current blocker</p>
            <p className="text-xs mt-1 leading-snug">{f.currentBlocker ?? 'None detected'}</p>
          </div>
        </div>

        {/* AI recommendation — explicitly flagged as decision support */}
        {f.aiRecommendation && (
          <div className="rounded-md border-emerald-500/35 bg-emerald-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-emerald-400 flex items-center gap-1 mb-1">
              <ThumbsUp className="h-2.5 w-2.5" /> Recommended next action
            </p>
            <p className="text-xs leading-snug">{f.aiRecommendation}</p>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              AI decision support — a human officer must approve operational action.
            </p>
          </div>
        )}

        {brief.modelNote && (
          <p className="text-[10px] text-amber-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>AI summary unavailable ({brief.modelNote}). Showing facts derived directly from the incident record.</span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
