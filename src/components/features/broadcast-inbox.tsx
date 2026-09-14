'use client'
// GAME-CHANGER #7 — Impact-zone emergency broadcast inbox (citizen side).
//
// A citizen ONLY ever sees broadcasts that were actually delivered to them,
// which the backend guarantees by scoping to the delivery log. Nothing is shown
// here that was sent to somebody else.

import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Megaphone, MapPin, ShieldAlert, Route, Home, Loader2, AlertTriangle, Inbox } from 'lucide-react'

interface BroadcastItem {
  id: string
  broadcastCode: string
  title: string
  body: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  areaLabel: string | null
  safetyInstructions: string | null
  evacuationInfo: string | null
  safePlaceInfo: string | null
  radiusKm: number
  status: string
  createdAt: string
  deliveryStatus: string
  distanceKm: number | null
}

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'border-red-500/70 bg-red-500/12',
  HIGH: 'border-orange-500/60 bg-orange-500/10',
  MEDIUM: 'border-amber-500/50 bg-amber-500/10',
  LOW: 'border-slate-500/40 bg-slate-500/5',
}

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'border-red-400/60 text-red-300',
  HIGH: 'border-orange-400/60 text-orange-300',
  MEDIUM: 'border-amber-400/60 text-amber-300',
  LOW: 'border-slate-400/50 text-slate-300',
}

function timeAgo(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs + 'h ago'
  return Math.floor(hrs / 24) + 'd ago'
}

export function BroadcastInbox() {
  const [items, setItems] = useState<BroadcastItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ broadcasts: BroadcastItem[] }>('/api/features?feature=broadcasts&limit=10')
      setItems(res.broadcasts)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Empty state is a first-class state: most of the time a citizen has no
  // emergency broadcasts, and that is good news, not an error.
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking for emergency alerts…
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <Inbox className="h-5 w-5 text-muted-foreground/60 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">No emergency alerts for your area</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You will only receive alerts when an authorized officer issues one that covers your location.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-amber-400" />
          Emergency Alerts
          <Badge variant="outline" className="text-[10px] font-mono ml-1">{items.length}</Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Official instructions issued for your location by the command center.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {items.map((b) => {
          const isOpen = openId === b.id
          return (
            <div
              key={b.id}
              className={cn('rounded-lg border p-3', SEVERITY_STYLE[b.severity] ?? SEVERITY_STYLE.LOW)}
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : b.id)}
                className="w-full text-left"
                aria-expanded={isOpen}
              >
                <div className="flex items-start gap-2 flex-wrap">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="font-semibold text-sm flex-1 min-w-0">{b.title}</span>
                  <Badge variant="outline" className={cn('text-[9px] font-mono', SEVERITY_BADGE[b.severity])}>
                    {b.severity}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">{timeAgo(b.createdAt)}</span>
                </div>
                <p className="text-xs mt-1.5 leading-snug opacity-95">{b.body}</p>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[10px] text-muted-foreground font-mono">
                  <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />
                    {b.areaLabel ?? ('within ' + b.radiusKm + ' km')}
                  </span>
                  {b.distanceKm != null && <span>{b.distanceKm} km from you</span>}
                  <span>{b.broadcastCode}</span>
                </div>
              </button>

              {isOpen && (
                <div className="mt-2.5 pt-2.5 border-t border-current/20 space-y-2">
                  {b.safetyInstructions && (
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
                      <div>
                        <p className="text-[11px] font-semibold">Safety instructions</p>
                        <p className="text-xs opacity-90 leading-snug">{b.safetyInstructions}</p>
                      </div>
                    </div>
                  )}
                  {b.evacuationInfo && (
                    <div className="flex items-start gap-2">
                      <Route className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
                      <div>
                        <p className="text-[11px] font-semibold">Evacuation</p>
                        <p className="text-xs opacity-90 leading-snug">{b.evacuationInfo}</p>
                      </div>
                    </div>
                  )}
                  {b.safePlaceInfo && (
                    <div className="flex items-start gap-2">
                      <Home className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
                      <div>
                        <p className="text-[11px] font-semibold">Nearest safe place</p>
                        <p className="text-xs opacity-90 leading-snug">{b.safePlaceInfo}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
