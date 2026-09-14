'use client'
// GAME-CHANGER #1 — ONE-TAP EMERGENCY COMMUNICATION
// GAME-CHANGER #6 — honest communication-health strip
//
// A citizen taps one button; the app converts it into a STRUCTURED incident
// update on the backend (which classifies priority with AI). No long typing.
//
// GPS is only attached after the browser grants permission — the user is asked
// explicitly, and a denied/failed fix simply sends the update without location.

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  LifeBuoy, Ambulance, Droplets, Utensils, Construction, HeartPulse,
  Home, Siren, Loader2, MapPin, CheckCircle2, AlertTriangle, Wifi, WifiOff,
} from 'lucide-react'

interface QuickAction {
  key: string
  label: string
  needType: string
  severityHint: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  emoji?: string
}

interface SendResult {
  incidentCode: string
  action: { key: string; label: string }
  priority: string
  priorityReason: string
  requiredAction: string
  classificationSource: string
}

const ICONS: Record<string, any> = {
  SOS: Siren,
  NEED_RESCUE: LifeBuoy,
  PERSON_INJURED: HeartPulse,
  NEED_AMBULANCE: Ambulance,
  ROAD_BLOCKED: Construction,
  SHELTER_REQUIRED: Home,
  NEED_WATER: Droplets,
  NEED_FOOD: Utensils,
}

const PRIORITY_STYLE: Record<string, string> = {
  CRITICAL: 'border-red-500/60 bg-red-500/15 text-red-300',
  HIGH: 'border-orange-500/50 bg-orange-500/15 text-orange-300',
  MEDIUM: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
  LOW: 'border-slate-500/50 bg-slate-500/15 text-slate-300',
}

export function QuickEmergencyActions({
  incidentId,
  incidentCode,
  compact = false,
}: {
  incidentId: string
  incidentCode?: string
  compact?: boolean
}) {
  const [actions, setActions] = useState<QuickAction[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<SendResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [locationNote, setLocationNote] = useState<string | null>(null)

  // Load the canonical action list from the backend so the UI can never drift
  // from the structured keys the API validates.
  useEffect(() => {
    let cancelled = false
    apiGet<{ actions: QuickAction[] }>('/api/features?feature=quick-actions')
      .then((r) => { if (!cancelled) setActions(r.actions) })
      .catch(() => { if (!cancelled) setError('Could not load emergency actions.') })
    return () => { cancelled = true }
  }, [])

  /**
   * Ask for GPS permission only when the citizen actually sends something.
   * Returns null when the user declines or the device cannot provide a fix —
   * the update is still sent, just without coordinates.
   */
  const getConsentedLocation = useCallback(async (): Promise<{ lat: number; lng: number; accuracy: number } | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationNote('Location not available on this device — update sent without GPS.')
      return null
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        () => {
          setLocationNote('Location permission declined — update sent without GPS.')
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      )
    })
  }, [])

  const send = async (actionKey: string) => {
    if (busy) return
    setBusy(actionKey)
    setError(null)
    setLocationNote(null)
    setResult(null)

    try {
      const loc = await getConsentedLocation()
      const res = await apiPost<SendResult>('/api/features', {
        action: 'quick-action',
        incidentId,
        actionKey,
        note: note.trim() || undefined,
        ...(loc ? { latitude: loc.lat, longitude: loc.lng, accuracy: loc.accuracy } : {}),
      })
      setResult(res)
      setNote('')
    } catch (e: any) {
      setError(e?.message || 'The update could not be sent. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Siren className="h-4 w-4 text-red-400" />
          Quick Emergency Updates
        </CardTitle>
        <CardDescription className="text-xs">
          One tap sends a structured update to the command center{incidentCode ? ` for ${incidentCode}` : ''}.
          Add a note only if you need to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* The one-tap grid */}
        <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
          {actions.map((a) => {
            const Icon = ICONS[a.key] ?? AlertTriangle
            const isSos = a.key === 'SOS'
            const isBusy = busy === a.key
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => send(a.key)}
                disabled={!!busy}
                aria-label={`Send: ${a.label}`}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-[11px] font-semibold transition-all',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  isSos
                    ? 'border-red-500/70 bg-red-600/20 text-red-200 hover:bg-red-600/35'
                    : 'border-border bg-card/60 text-foreground hover:border-primary/50 hover:bg-primary/10',
                )}
              >
                {isBusy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Icon className={cn('h-5 w-5', isSos && 'text-red-400')} />
                )}
                <span className="text-center leading-tight">{a.label}</span>
              </button>
            )
          })}
        </div>

        {/* Optional short note */}
        <div className="space-y-1.5">
          <label htmlFor="quick-note" className="text-[11px] font-medium text-muted-foreground">
            Optional note (what is happening?)
          </label>
          <Textarea
            id="quick-note"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Water is rising on the ground floor, 6 people including 2 children"
            className="text-sm resize-none"
          />
        </div>

        {/* Location consent status */}
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            Your location is requested when you tap an action and is attached only if you allow it.
          </span>
        </p>

        {locationNote && (
          <p className="text-[11px] text-amber-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{locationNote}</span>
          </p>
        )}

        {/* Result — shows the REAL priority the backend assigned */}
        {result && (
          <div className={cn('rounded-lg border p-3 space-y-1.5', PRIORITY_STYLE[result.priority] ?? PRIORITY_STYLE.MEDIUM)}>
            <p className="text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Update sent — {result.action.label}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={cn('text-[10px] font-mono border-current', PRIORITY_STYLE[result.priority])}>
                {result.priority} PRIORITY
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono border-current">
                {result.classificationSource === 'ai' ? 'AI CLASSIFIED' : 'TRIAGE RULE'}
              </Badge>
              {result.incidentCode && (
                <span className="text-[10px] font-mono opacity-80">{result.incidentCode}</span>
              )}
            </div>
            <p className="text-[11px] leading-snug opacity-90">{result.priorityReason}</p>
            <p className="text-[11px] leading-snug font-medium">
              Command center action: {result.requiredAction}
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── GAME-CHANGER #6 (frontend half) — communication status strip ─────────
// Shows LIVE / DELAYED / OFFLINE plus the real age of the last update.
// The client merges its OWN browser connectivity so the server does not have to
// guess whether this particular device is online.

interface CommsHealthResponse {
  state: 'LIVE' | 'DELAYED' | 'OFFLINE'
  websocketConnected: boolean
  apiReachable: boolean
  secondsSinceLastUpdate: number | null
  lastUpdateLabel: string
  notificationDelivery: string
  details?: { notes?: string[] }
}

export function CommunicationHealthStrip({ incidentId }: { incidentId?: string }) {
  const [health, setHealth] = useState<CommsHealthResponse | null>(null)
  const [browserOnline, setBrowserOnline] = useState(true)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const q = incidentId ? `&incidentId=${encodeURIComponent(incidentId)}` : ''
      const res = await apiGet<CommsHealthResponse>(`/api/features?feature=comms-health${q}`)
      setHealth(res)
    } catch {
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [incidentId])

  useEffect(() => {
    load()
    const on = () => { setBrowserOnline(true); load() }
    const off = () => setBrowserOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    setBrowserOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    // Poll so the "last update" age stays truthful.
    const t = setInterval(load, 30000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearInterval(t)
    }
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking connection…
      </div>
    )
  }

  // The browser is the authority on THIS device's connectivity.
  const effectiveState: 'LIVE' | 'DELAYED' | 'OFFLINE' =
    !browserOnline ? 'OFFLINE' : (health?.state ?? 'DELAYED')

  const style =
    effectiveState === 'LIVE'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : effectiveState === 'DELAYED'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-red-500/40 bg-red-500/10 text-red-300'

  const label =
    effectiveState === 'LIVE'
      ? 'LIVE'
      : effectiveState === 'DELAYED'
        ? 'DELAYED'
        : 'OFFLINE'

  return (
    <div className={cn('rounded-md border px-2.5 py-1.5 text-[11px] flex items-center gap-2 flex-wrap', style)}>
      {effectiveState === 'OFFLINE' ? <WifiOff className="h-3.5 w-3.5 shrink-0" /> : <Wifi className="h-3.5 w-3.5 shrink-0" />}
      <span className="font-bold font-mono">{label}</span>
      <span className="opacity-80">·</span>
      <span className="opacity-90">{health?.lastUpdateLabel ?? 'No update data'}</span>
      {!browserOnline && <span className="opacity-90">· This device is offline — showing last known data.</span>}
      {browserOnline && health && !health.websocketConnected && (
        <span className="opacity-90">· Live channel unavailable — falling back to periodic refresh.</span>
      )}
    </div>
  )
}
