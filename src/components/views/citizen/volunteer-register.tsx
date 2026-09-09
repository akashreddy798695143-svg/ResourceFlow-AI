'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/use-auth'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'
import { toast } from 'sonner'
import {
  HandHeart, MapPin, Loader2, Navigation, ShieldCheck,
  AlertTriangle, ToggleLeft, ToggleRight, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useVolunteerLocation } from '@/hooks/use-volunteer-location'
import type { VolunteerRegistration } from '@/lib/types'

const SKILL_OPTIONS = [
  'First Aid', 'Rescue Support', 'Medical', 'Transportation', 'Food Distribution',
  'Shelter Management', 'Communication', 'Search & Rescue', 'Counseling', 'Logistics',
]

interface PositionRequest {
  coords?: { latitude: number; longitude: number; accuracy: number | null }
  code?: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNAVAILABLE'
}

// Requests a real GPS fix. The error code distinguishes "permission denied"
// (location stays "Not shared") from device/browser unavailability.
function requestPosition(): Promise<PositionRequest> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ code: 'UNAVAILABLE' })
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy ?? null } }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) return resolve({ code: 'PERMISSION_DENIED' })
        if (err.code === err.POSITION_UNAVAILABLE) return resolve({ code: 'POSITION_UNAVAILABLE' })
        if (err.code === err.TIMEOUT) return resolve({ code: 'TIMEOUT' })
        return resolve({ code: 'UNAVAILABLE' })
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    )
  })
}

export function VolunteerRegisterView() {
  const { user } = useAuth()
  const [registration, setRegistration] = useState<VolunteerRegistration | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [skills, setSkills] = useState('')
  const [customSkills, setCustomSkills] = useState('')
  const [availability, setAvailability] = useState('AVAILABLE')
  const [areas, setAreas] = useState('')
  const [hasTransport, setHasTransport] = useState(false)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'detecting' | 'detected' | 'denied' | 'unavailable'>('idle')
  const [detectedLat, setDetectedLat] = useState<number | null>(null)
  const [detectedLng, setDetectedLng] = useState<number | null>(null)
  const [locationSharing, setLocationSharing] = useState(false)

  // Live location tracking — active for any registered volunteer with sharing ON
  // (independent of the verification status; watchPosition sends updates as the volunteer moves).
  const registered = !!registration
  const { tracking, lastSent, error: locationError, queuedCount, permissionDenied: hookPermissionDenied } = useVolunteerLocation(true, registered, locationSharing)

  const loadRegistration = useCallback(async () => {
    try {
      const res = await apiGet<{ registration: VolunteerRegistration | null }>('/api/citizen/volunteer')
      if (res.registration) {
        setRegistration(res.registration)
        setSkills(res.registration.skills || '')
        setAvailability(res.registration.availability || 'AVAILABLE')
        setAreas(res.registration.areas || '')
        setHasTransport(res.registration.hasTransport)
        setLocationSharing(res.registration.locationSharing)
        if (res.registration.latitude && res.registration.longitude) {
          setDetectedLat(res.registration.latitude)
          setDetectedLng(res.registration.longitude)
          setLocationStatus('detected')
        }
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRegistration() }, [loadRegistration])

  const detectLocation = useCallback(async (): Promise<boolean> => {
    setLocationStatus('detecting')
    const res = await requestPosition()
    if (res.coords) {
      setDetectedLat(res.coords.latitude)
      setDetectedLng(res.coords.longitude)
      setLocationStatus('detected')
      return true
    }
    if (typeof navigator !== 'undefined' && !navigator.geolocation) {
      setLocationStatus('unavailable')
    } else if (res.code === 'PERMISSION_DENIED') {
      setLocationStatus('denied')
      toast.error('Location permission denied. Your location stays "Not shared" until you allow access in your browser.')
    } else {
      setLocationStatus('unavailable')
      toast.error('Could not determine your GPS location. Please try again.')
    }
    return false
  }, [])

  // "Share My Location" — requests browser permission, then enables sharing.
  // On success the hook starts navigator.geolocation.watchPosition() which saves
  // real latitude/longitude to /api/volunteer/location as the volunteer moves.
  // On denial sharing stays OFF and the location remains "Not shared".
  const handleShareMyLocation = useCallback(async () => {
    const ok = await detectLocation()
    if (!ok) return
    setLocationSharing(true)
    if (!registered) return // sharing + coords are saved with the registration submit
    try {
      await apiPatch('/api/volunteer/location', { locationSharing: true })
      toast.success('Location sharing enabled — your live GPS location is updating')
    } catch (e: any) {
      toast.error(e.message)
    }
  }, [detectLocation, registered])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true)
    try {
      const finalSkills = customSkills.trim() || skills
      await apiPost('/api/citizen/volunteer', { skills: finalSkills, availability, areas: areas || null, hasTransport, latitude: locationSharing && detectedLat != null ? detectedLat : undefined, longitude: locationSharing && detectedLng != null ? detectedLng : undefined, locationSharing })
      toast.success('Volunteer registration submitted!'); loadRegistration()
    } catch (e: any) { toast.error(e.message) } finally { setSubmitting(false) }
  }
  const handleUpdateAvailability = async (a: string) => { try { await apiPatch('/api/citizen/volunteer', { availability: a }); setAvailability(a); toast.success('Availability updated'); loadRegistration() } catch (e: any) { toast.error(e.message) } }
  const handleToggleLocationSharing = async (enabled: boolean) => {
    if (enabled) {
      if (locationStatus !== 'detected') {
        const ok = await detectLocation()
        if (!ok) return // permission denied / unavailable — keep sharing OFF ("Not shared")
      }
      setLocationSharing(true)
      try {
        await apiPatch('/api/volunteer/location', { locationSharing: true })
        toast.success('Enabled')
      } catch (e: any) { toast.error(e.message) }
      loadRegistration()
    } else {
      setLocationSharing(false)
      try {
        await apiPatch('/api/volunteer/location', { locationSharing: false })
        toast.success('Disabled')
      } catch (e: any) { toast.error(e.message) }
      loadRegistration()
    }
  }

  if (loading) { return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div> }

  if (registration) {
    const sc: Record<string, string> = { PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30', APPROVED: 'bg-blue-500/15 text-blue-400 border-blue-500/30', ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', INACTIVE: 'bg-muted text-muted-foreground', REJECTED: 'bg-red-500/15 text-red-400 border-red-500/30' }
    const isVerified = ['APPROVED', 'ACTIVE'].includes(registration.status)
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold flex items-center gap-2"><HandHeart className="h-6 w-6 text-primary" /> Volunteer Status</h1>
        <Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-base">Status</CardTitle><Badge variant="outline" className={cn('text-xs', sc[registration.status] || '')}>{registration.status}</Badge></div></CardHeader>
          <CardContent className="space-y-3"><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-[10px] text-muted-foreground uppercase">Skills</p><p>{registration.skills}</p></div><div><p className="text-[10px] text-muted-foreground uppercase">Areas</p><p>{registration.areas || '—'}</p></div><div><p className="text-[10px] text-muted-foreground uppercase">Transport</p><p>{registration.hasTransport ? 'Yes' : 'No'}</p></div><div><p className="text-[10px] text-muted-foreground uppercase">Registered</p><p>{new Date(registration.createdAt).toLocaleDateString()}</p></div></div>
            {registration.verifiedSafe && <div className="flex items-center gap-1.5 text-xs text-emerald-500"><ShieldCheck className="h-3.5 w-3.5" /> Verified Safe</div>}</CardContent></Card>
        {isVerified && (<Card><CardHeader className="pb-3"><CardTitle className="text-base">Availability</CardTitle></CardHeader><CardContent><div className="grid grid-cols-3 gap-2">{['AVAILABLE', 'BUSY', 'OFFLINE'].map((opt) => (<Button key={opt} variant={availability === opt ? 'default' : 'outline'} size="sm" onClick={() => handleUpdateAvailability(opt)} className={cn(opt === 'AVAILABLE' && availability === opt && 'bg-emerald-600', opt === 'BUSY' && availability === opt && 'bg-amber-600', opt === 'OFFLINE' && availability === opt && 'bg-gray-600')}><span className={cn('h-2 w-2 rounded-full', opt === 'AVAILABLE' ? 'bg-emerald-400' : opt === 'BUSY' ? 'bg-amber-400' : 'bg-gray-400')} />{opt}</Button>))}</div></CardContent></Card>)}
        {registration && (<Card><CardHeader className="pb-3"><CardTitle className="text-base">Location Sharing</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2">{locationSharing ? <ToggleRight className="h-5 w-5 text-emerald-500" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}<span className="text-sm">{locationSharing ? 'ON' : 'OFF'}</span></div><Switch checked={locationSharing} onCheckedChange={handleToggleLocationSharing} /></div>
          {locationStatus === 'detected' && detectedLat != null && detectedLng != null && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-emerald-500" /> {detectedLat.toFixed(5)}, {detectedLng.toFixed(5)}</div>}
          {(locationStatus === 'denied' || hookPermissionDenied) && <p className="text-xs text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Permission denied. Your location stays "Not shared" — allow location access in your browser settings.</p>}
          {locationError && <p className="text-xs text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {locationError}{queuedCount > 0 && ' — retrying when back online'}</p>}
          {locationSharing && registered && (
            <div className="flex items-center gap-1.5 text-xs">
              {tracking ? (<><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-emerald-500">Live — updating every 30s</span>{lastSent && <span className="text-muted-foreground">· Last sent {lastSent.toLocaleTimeString()}</span>}</>)
                : (<><span className="h-2 w-2 rounded-full bg-amber-400" /><span className="text-amber-500">Last known location{queuedCount > 0 ? ` — ${queuedCount} update(s) queued` : ''}</span></>)}
            </div>
          )}
          {!locationSharing && registered && <p className="text-xs text-muted-foreground">Location sharing is OFF — officers will not see your live location.</p>}
          <Button size="sm" variant="outline" onClick={handleShareMyLocation} disabled={locationStatus === 'detecting'} className="gap-1.5">{locationStatus === 'detecting' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}{locationStatus === 'detecting' ? 'Requesting…' : 'Share My Location'}</Button></CardContent></Card>)}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2"><HandHeart className="h-6 w-6 text-primary" /> Register as Volunteer</h1>
      <form onSubmit={handleRegister}><Card><CardHeader className="pb-3"><CardTitle className="text-base">Volunteer Details</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="space-y-1.5"><Label>Primary Skills</Label><Select value={skills} onValueChange={setSkills}><SelectTrigger><SelectValue placeholder="Select your primary skill" /></SelectTrigger><SelectContent>{SKILL_OPTIONS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select><Textarea placeholder="Additional skills (optional)" value={customSkills} onChange={(e) => setCustomSkills(e.target.value)} className="min-h-[60px] text-sm" /></div>
        <div className="space-y-1.5"><Label>Service Areas</Label><Input placeholder="e.g. Downtown, North District" value={areas} onChange={(e) => setAreas(e.target.value)} /></div>
        <div className="flex items-center gap-2"><Switch checked={hasTransport} onCheckedChange={setHasTransport} /><Label className="!mt-0">I have personal transportation</Label></div>
        <div className="space-y-2 rounded-md border border-border p-3"><div className="flex items-center justify-between"><Label className="!mt-0 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Current Location (optional)</Label><Button type="button" size="sm" variant="outline" onClick={handleShareMyLocation} disabled={locationStatus === 'detecting'}>{locationStatus === 'detecting' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}{locationStatus === 'detecting' ? 'Requesting…' : 'Share My Location'}</Button></div>
          {locationStatus === 'detected' && detectedLat != null && detectedLng != null && <div className="flex items-center gap-1.5 text-xs text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" /> Detected: {detectedLat.toFixed(5)}, {detectedLng.toFixed(5)}</div>}
          {locationStatus === 'denied' && <p className="text-xs text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Location permission denied. Your location stays "Not shared" — registration continues without it.</p>}
          {locationStatus === 'unavailable' && <p className="text-xs text-muted-foreground">Location not available on this device.</p>}
          {locationStatus === 'detected' && <div className="flex items-center gap-2 pt-1 border-t border-border"><Switch checked={locationSharing} onCheckedChange={setLocationSharing} /><span className="text-xs">Share my location with officers</span></div>}
        </div>
        <Button type="submit" className="w-full gap-2" disabled={submitting || !skills}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandHeart className="h-4 w-4" />}{submitting ? 'Submitting…' : 'Register as Volunteer'}</Button>
      </CardContent></Card></form>
    </div>
  )
}