'use client'
// GAME-CHANGER #7 — IMPACT-ZONE EMERGENCY BROADCAST (officer composer)
//
// Officer/Admin only. The composer makes the blast radius explicit before
// sending, reports the REAL delivery outcome afterwards, and never claims a
// delivery that did not happen.

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Megaphone, Loader2, Send, MapPin, Users, CheckCircle2, AlertTriangle,
  ShieldAlert, Route, Home, Crosshair, ChevronDown, ChevronUp,
} from 'lucide-react'

interface SendResult {
  broadcastCode: string
  recipientCount: number
  sentCount: number
  failedCount: number
  radiusKm: number
}

interface BroadcastRow {
  id: string
  broadcastCode: string
  title: string
  severity: string
  areaLabel: string | null
  radiusKm: number
  recipientCount: number
  sentCount: number
  failedCount: number
  createdByName: string | null
  createdAt: string
  status: string
}

export function BroadcastComposer({
  incidentId,
  defaultLat,
  defaultLng,
  defaultLocationName,
}: {
  incidentId?: string
  defaultLat?: number
  defaultLng?: number
  defaultLocationName?: string
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH')
  const [radiusKm, setRadiusKm] = useState('5')
  const [areaLabel, setAreaLabel] = useState(defaultLocationName ?? '')
  const [safety, setSafety] = useState('')
  const [evacuation, setEvacuation] = useState('')
  const [safePlace, setSafePlace] = useState('')
  const [lat, setLat] = useState(defaultLat != null ? String(defaultLat) : '')
  const [lng, setLng] = useState(defaultLng != null ? String(defaultLng) : '')
  const [showDetails, setShowDetails] = useState(false)

  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<BroadcastRow[]>([])

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiGet<{ broadcasts: BroadcastRow[] }>('/api/features?feature=broadcasts&limit=5')
      setHistory(res.broadcasts as BroadcastRow[])
    } catch { /* history is non-critical */ }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  // Prefill coordinates from the incident when the officer opens the composer.
  useEffect(() => {
    if (defaultLat != null) setLat(String(defaultLat))
    if (defaultLng != null) setLng(String(defaultLng))
    if (defaultLocationName) setAreaLabel(defaultLocationName)
  }, [defaultLat, defaultLng, defaultLocationName])

  const useMyLocation = () => {
    setError(null)
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not available on this device.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude))
        setLng(String(pos.coords.longitude))
      },
      () => setError('Location permission declined — enter coordinates manually.'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  const send = async () => {
    setError(null)
    setResult(null)

    if (!title.trim()) return setError('A broadcast title is required.')
    if (!body.trim()) return setError('A broadcast message is required.')
    const latN = Number(lat)
    const lngN = Number(lng)
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return setError('Valid centre coordinates are required.')
    }

    setSending(true)
    try {
      const res = await apiPost<SendResult>('/api/features', {
        action: 'broadcast',
        title: title.trim(),
        body: body.trim(),
        severity,
        latitude: latN,
        longitude: lngN,
        radiusKm: Number(radiusKm) || 5,
        areaLabel: areaLabel.trim() || undefined,
        safetyInstructions: safety.trim() || undefined,
        evacuationInfo: evacuation.trim() || undefined,
        safePlaceInfo: safePlace.trim() || undefined,
        incidentId,
      })
      setResult(res)
      setTitle('')
      setBody('')
      setSafety('')
      setEvacuation('')
      setSafePlace('')
      loadHistory()
    } catch (e: any) {
      setError(e?.message || 'The broadcast could not be sent.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-amber-400" />
          Impact-Zone Emergency Broadcast
        </CardTitle>
        <CardDescription className="text-xs">
          Sends an official alert only to citizens inside the impact radius. Officer authorization required.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="bc-title" className="text-xs">Alert title</Label>
          <Input
            id="bc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="e.g. Flood warning — avoid the eastern road"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bc-body" className="text-xs">Message</Label>
          <Textarea
            id="bc-body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1500}
            placeholder="Water levels are rising near the eastern road. Move to the nearest designated safe location."
            className="resize-none text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bc-radius" className="text-xs">Impact radius (km)</Label>
            <Input
              id="bc-radius"
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bc-area" className="text-xs">Area label (optional)</Label>
          <Input
            id="bc-area"
            value={areaLabel}
            onChange={(e) => setAreaLabel(e.target.value)}
            maxLength={300}
            placeholder="e.g. Peapully east"
          />
        </div>

        {/* Centre coordinates */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Broadcast centre</Label>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1" onClick={useMyLocation}>
              <Crosshair className="h-3 w-3" /> Use my location
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number" step="any" placeholder="Latitude"
              value={lat} onChange={(e) => setLat(e.target.value)}
            />
            <Input
              type="number" step="any" placeholder="Longitude"
              value={lng} onChange={(e) => setLng(e.target.value)}
            />
          </div>
        </div>

        {/* Optional detail fields */}
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Safety, evacuation and safe-place details (optional)
        </button>

        {showDetails && (
          <div className="space-y-2.5 pl-1">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <ShieldAlert className="h-3 w-3 text-amber-400" /> Safety instructions
              </Label>
              <Textarea rows={2} value={safety} onChange={(e) => setSafety(e.target.value)} maxLength={1000} className="resize-none text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Route className="h-3 w-3 text-amber-400" /> Evacuation information
              </Label>
              <Textarea rows={2} value={evacuation} onChange={(e) => setEvacuation(e.target.value)} maxLength={1000} className="resize-none text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Home className="h-3 w-3 text-emerald-400" /> Safe place information
              </Label>
              <Textarea rows={2} value={safePlace} onChange={(e) => setSafePlace(e.target.value)} maxLength={1000} className="resize-none text-sm" />
            </div>
          </div>
        )}

        {/* Pre-send scope warning — makes the blast radius explicit */}
        <div className="rounded-md border-amber-500/40 bg-amber-500/5 p-2.5 flex items-start gap-2">
          <Users className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-snug">
            This alert will be delivered only to citizens with a recorded location within{' '}
            <span className="font-semibold">{radiusKm || '5'} km</span> of the centre. Citizens outside the
            radius are not notified.
          </p>
        </div>

        {error && (
          <p className="text-xs text-red-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <Button onClick={send} disabled={sending} className="w-full gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Sending broadcast…' : 'Send emergency broadcast'}
        </Button>

        {/* Real delivery outcome — never fabricated */}
        {result && (
          <div
            className={cn(
              'rounded-md border p-3 space-y-1.5',
              result.recipientCount === 0
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-emerald-500/40 bg-emerald-500/5',
            )}
          >
            <p className="text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Broadcast {result.broadcastCode} sent
            </p>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Badge variant="outline" className="text-[10px] font-mono">
                {result.recipientCount} recipient{result.recipientCount === 1 ? '' : 's'}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/50 text-emerald-300">
                {result.sentCount} delivered
              </Badge>
              {result.failedCount > 0 && (
                <Badge variant="outline" className="text-[10px] font-mono border-red-500/50 text-red-300">
                  {result.failedCount} failed
                </Badge>
              )}
            </div>
            {result.recipientCount === 0 && (
              <p className="text-[11px] text-amber-400 leading-snug">
                No citizens have a recorded location inside this radius, so no one was notified. This is
                expected when the area has no active reporters — widen the radius if that is unintended.
              </p>
            )}
          </div>
        )}

        {/* Recent broadcasts */}
        {history.length > 0 && (
          <div className="pt-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Recent broadcasts</p>
            <div className="space-y-1.5">
              {history.map((b) => (
                <div key={b.id} className="rounded-md border-border bg-card/40 px-2.5 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] text-primary">{b.broadcastCode}</span>
                    <span className="text-xs font-medium flex-1 min-w-0 truncate">{b.title}</span>
                    <Badge variant="outline" className="text-[9px] font-mono">{b.severity}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {b.sentCount}/{b.recipientCount} delivered · {b.radiusKm} km · {b.areaLabel ?? 'unnamed area'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
