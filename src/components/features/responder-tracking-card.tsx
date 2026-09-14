'use client'
// GAME-CHANGER #5 — Responder ETA & live tracking (citizen-facing card).
//
// Shows ONLY the responder assigned to this incident. When live location is not
// available or is stale, the card says so plainly and shows the last authorized
// update instead — it never presents stale data as live.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Truck, MapPin, Clock, Navigation, AlertTriangle, CheckCircle2, Radio } from 'lucide-react'

interface ResponderState {
  assigned: boolean
  status: string | null
  code: string | null
  name: string | null
  type: string | null
  etaMinutes: number | null
  distanceKm: number | null
  live: boolean
  trackingState: string
  trackingLabel: string
  lastAuthorizedUpdate: {
    latitude: number
    longitude: number
    accuracy: number | null
    timestamp: string
  } | null
  destination: { latitude: number; longitude: number; name: string }
}

const STATE_STYLE: Record<string, string> = {
  LIVE: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
  ON_SCENE: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
  RESOLVED: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
  LAST_UPDATE: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  UNAVAILABLE: 'border-slate-500/50 bg-slate-500/10 text-slate-300',
  NOT_ASSIGNED: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
}

export function ResponderTrackingCard({ responder }: { responder: ResponderState | null }) {
  // Nothing assigned yet — this is a normal early state, not an error.
  if (!responder || !responder.assigned) {
    return (
      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <Truck className="h-5 w-5 text-muted-foreground/60 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">No response team assigned yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              A team will appear here once the command center approves an assignment.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const state = responder.trackingState
  const style = STATE_STYLE[state] ?? STATE_STYLE.UNAVAILABLE

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          Your Response Team
        </CardTitle>
        <CardDescription className="text-xs">
          Only the responder assigned to your incident is shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Resource identity + live status */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{responder.name ?? 'Assigned unit'}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {responder.code} · {responder.type ? responder.type.split('_').join(' ') : ''}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
            {responder.status ?? 'ASSIGNED'}
          </Badge>
        </div>

        {/* ETA + distance */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border-border bg-card/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> ETA
            </p>
            <p className="text-lg font-bold tabular-nums mt-0.5">
              {responder.etaMinutes != null ? responder.etaMinutes + ' min' : '—'}
            </p>
          </div>
          <div className="rounded-md border-border bg-card/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Navigation className="h-2.5 w-2.5" /> Distance
            </p>
            <p className="text-lg font-bold tabular-nums mt-0.5">
              {responder.distanceKm != null ? responder.distanceKm + ' km' : '—'}
            </p>
          </div>
        </div>

        {/* Live-tracking honesty banner */}
        <div className={cn('rounded-md border p-2.5 flex items-start gap-2 text-xs', style)}>
          {responder.live ? (
            <Radio className="h-3.5 w-3.5 mt-0.5 shrink-0 animate-pulse" />
          ) : state === 'ON_SCENE' || state === 'RESOLVED' ? (
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-medium leading-snug">{responder.trackingLabel}</p>
            {responder.lastAuthorizedUpdate && (
              <p className="text-[10px] opacity-80 font-mono mt-0.5">
                Last authorized update: {new Date(responder.lastAuthorizedUpdate.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Destination */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="min-w-0">
            Destination: <span className="text-foreground">{responder.destination.name}</span>
          </span>
        </div>

        <p className="text-[10px] text-muted-foreground leading-snug">
          Location sharing requires the responder's explicit consent. When sharing is off or the
          signal is lost, the last authorized position is shown and labelled accordingly.
        </p>
      </CardContent>
    </Card>
  )
}
