'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from '@/lib/use-router'
import { useAuth } from '@/lib/use-auth'
import { apiPost, apiGet } from '@/lib/api-client'
import { toast } from 'sonner'
import {
  MapPin, Loader2, Send, Mic, Square, Navigation, Crosshair, Edit3,
  RadioTower, MicOff, RefreshCw, CheckCircle2, AlertTriangle, Languages, Upload, X,
  Wifi, WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Type alias for the Web Speech API (not in standard TS DOM lib)
type SpeechRecognitionType = any

const LANGUAGES = [
  { code: 'en', label: 'English', speechCode: 'en-IN' },
  { code: 'te', label: 'తెలుగు', speechCode: 'te-IN' },
  { code: 'hi', label: 'हिन्दी', speechCode: 'hi-IN' },
]

const INCIDENT_TYPES = [
  { value: 'FLOOD', label: 'Flood' },
  { value: 'EARTHQUAKE', label: 'Earthquake' },
  { value: 'LANDSLIDE', label: 'Landslide' },
  { value: 'ROAD_BLOCKAGE', label: 'Road Blockage' },
  { value: 'BUILDING_COLLAPSE', label: 'Building Collapse' },
  { value: 'FOREST_FIRE', label: 'Forest Fire' },
  { value: 'HEAVY_RAINFALL', label: 'Heavy Rainfall' },
  { value: 'INDUSTRIAL_ACCIDENT', label: 'Industrial Accident' },
  { value: 'CYCLONE', label: 'Cyclone' },
  { value: 'FIRE', label: 'Urban / Residential Fire' },
  { value: 'MEDICAL', label: 'Medical Emergency' },
  { value: 'INFRASTRUCTURE', label: 'Infrastructure Failure' },
  { value: 'OTHER', label: 'Other' },
]

interface GpsFix {
  lat: number
  lng: number
  accuracy: number
  timestamp: string
}

interface QueuedReport {
  id: string
  payload: Record<string, unknown>
  queuedAt: string
}

const QUEUED_REPORTS_KEY = 'resourceflow:queued-reports'

export function ReportIncidentView() {
  const { navigate } = useRouter()
  const { user } = useAuth()
  const [type, setType] = useState('FLOOD')
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState('en')
  const [inputMethod, setInputMethod] = useState<'text' | 'voice'>('text')
  const [gps, setGps] = useState<GpsFix | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'requesting' | 'success' | 'denied' | 'error'>('idle')
  const [locationName, setLocationName] = useState<string | null>(null)
  const [locationNameLoading, setLocationNameLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [mapPicker, setMapPicker] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  // Optional photo upload (image metadata only — the backend validates type + size)
  const [imageMeta, setImageMeta] = useState<{ filename?: string; size?: number; contentType?: string } | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [queuedReports, setQueuedReports] = useState<QueuedReport[]>([])

  // Speech recognition state
  const [listening, setListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [voiceSupported, setVoiceSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionType | null>(null)

  // ─── Auto GPS request on mount ─────────────────────────────────────────
  useEffect(() => {
    requestGps()
    setIsOnline(navigator.onLine)
    try {
      setQueuedReports(JSON.parse(localStorage.getItem(QUEUED_REPORTS_KEY) || '[]'))
    } catch {
      setQueuedReports([])
    }
    // Check if Web Speech API is supported
    if (typeof window !== 'undefined') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      setVoiceSupported(!!SR)
    }
  }, [])

  const saveQueuedReports = useCallback((reports: QueuedReport[]) => {
    setQueuedReports(reports)
    localStorage.setItem(QUEUED_REPORTS_KEY, JSON.stringify(reports))
  }, [])

  const flushQueuedReports = useCallback(async () => {
    let reports: QueuedReport[] = []
    try { reports = JSON.parse(localStorage.getItem(QUEUED_REPORTS_KEY) || '[]') } catch { return }
    if (!reports.length) return

    const remaining: QueuedReport[] = []
    for (const report of reports) {
      try {
        await apiPost('/api/incidents', report.payload)
        toast.success('Queued emergency report submitted')
      } catch {
        remaining.push(report)
      }
    }
    saveQueuedReports(remaining)
  }, [saveQueuedReports])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      flushQueuedReports()
    }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [flushQueuedReports])

  const requestGps = useCallback(() => {
    setGpsStatus('requesting')
    if (!navigator.geolocation) {
      setGpsStatus('error')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix: GpsFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp).toISOString(),
        }
        setGps(fix)
        setGpsStatus('success')
        // Reverse-geocode the fix
        reverseGeocode(fix.lat, fix.lng)
      },
      (err) => {
        setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error')
        toast.error('Unable to detect your location automatically. You can place the pin manually.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }, [])

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setLocationNameLoading(true)
    try {
      const res = await apiGet<any>(`/api/geocode/reverse?lat=${lat}&lng=${lng}`)
      if (res.unavailable) {
        setLocationName('Location name unavailable')
      } else {
        setLocationName(res.shortName || res.displayName || 'Location name unavailable')
      }
    } catch {
      setLocationName('Location name unavailable')
    } finally {
      setLocationNameLoading(false)
    }
  }, [])

  // ─── Voice input (Web Speech API) ────────────────────────────────────────
  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      toast.error('Voice input is not supported in this browser. Please type instead.')
      return
    }
    const langObj = LANGUAGES.find((l) => l.code === language)
    const recognition = new SR()
    recognition.lang = langObj?.speechCode || 'en-IN'
    recognition.continuous = true
    recognition.interimResults = true
    recognitionRef.current = recognition
    setListening(true)
    setInterimTranscript('')

    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) final += transcript
        else interim += transcript
      }
      setInterimTranscript(interim)
      if (final) setDescription((prev) => (prev ? prev + ' ' + final : final))
    }
    setInterimTranscript('')
    recognition.onerror = (event: any) => {
      toast.error(`Speech recognition error: ${event.error}`)
      setListening(false)
    }
    recognition.onend = () => {
      setListening(false)
      setInterimTranscript('')
    }
    recognition.start()
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setListening(false)
    setInterimTranscript('')
  }

  // ─── Manual map location ───────────────────────────────────────────────
  const applyManualLocation = () => {
    const lat = Number(manualLat)
    const lng = Number(manualLng)
    if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      toast.error('Invalid coordinates')
      return
    }
    setGps({ lat, lng, accuracy: 0, timestamp: new Date().toISOString() })
    setGpsStatus('success')
    setMapPicker(false)
    reverseGeocode(lat, lng)
  }

  // ─── Submit ────────────────────────────────────────────────────────────
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) {
      toast.error('Only JPEG, PNG, WebP, GIF allowed')
      e.target.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large (max 10MB)')
      e.target.value = ''
      return
    }
    setImageMeta({ filename: file.name, size: file.size, contentType: file.type })
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const clearImage = () => {
    setImageMeta(null)
    setImagePreview(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (description.trim().length < 5) return toast.error('Describe the emergency in at least 5 characters')
    if (!gps) return toast.error('Location is required. Allow GPS access or place the pin manually.')

    const payload = {
      incidentType: type,
      description: description.trim(),
      latitude: gps.lat,
      longitude: gps.lng,
      location,
      language,
      inputMethod,
      locationAccuracy: gps.accuracy,
      locationTimestamp: gps.timestamp,
      imageMeta,
    }

    setSubmitting(true)
    try {
      // The backend derives identity from the authenticated session.
      const res = await apiPost<{ incidentCode: string; id: string; citizen: any; location: any }>('/api/incidents', payload)
      toast.success(`Report received: ${res.incidentCode}`, {
        description: 'AI analysis started. Track status with your incident code.',
      })
      navigate(user?.role === 'CITIZEN' ? '/citizen-dashboard' : `/incidents/${res.id}`)
    } catch (e: any) {
      if (!navigator.onLine || e?.name === 'TypeError') {
        const report: QueuedReport = { id: crypto.randomUUID(), payload, queuedAt: new Date().toISOString() }
        saveQueuedReports([...queuedReports, report])
        toast.success('Saved on this device', { description: 'The report will submit automatically when connectivity returns.' })
      } else {
        toast.error(e.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // `location` is the reverse-geocoded name — if we already have it, pass it
  const location = locationName && locationName !== 'Location name unavailable' ? locationName : undefined

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span>🚨</span> Report Emergency
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your location is captured automatically. Your identity is attached from your account.
        </p>
        <div className={cn('mt-3 flex items-center justify-between rounded-md border px-3 py-2 text-xs', isOnline ? 'border-sev-LOW/30 bg-sev-LOW/10 text-sev-LOW' : 'border-sev-MEDIUM/40 bg-sev-MEDIUM/10 text-sev-MEDIUM')}>
          <span className="flex items-center gap-1.5">{isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />} {isOnline ? 'Online — reports submit normally' : 'Offline — reports will be saved locally'}</span>
          {queuedReports.length > 0 && <span className="font-mono">{queuedReports.length} queued</span>}
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <form onSubmit={submit} className="space-y-5">
            {/* Language selector */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Languages className="h-3.5 w-3.5" /> Language</Label>
              <div className="flex gap-2">
                {LANGUAGES.map((l) => (
                  <Button
                    key={l.code}
                    type="button"
                    size="sm"
                    variant={language === l.code ? 'default' : 'outline'}
                    className={cn('flex-1', language === l.code && 'bg-primary text-primary-foreground')}
                    onClick={() => { setLanguage(l.code); if (listening) stopListening() }}
                  >
                    {l.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Incident type */}
            <div className="space-y-1.5">
              <Label htmlFor="type">Incident type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description with voice */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Description</Label>
                {voiceSupported && (
                  <Badge variant={listening ? 'default' : 'outline'} className={cn('text-[9px] gap-1', listening && 'animate-pulse')}>
                    <Mic className="h-2.5 w-2.5" /> {listening ? 'Listening…' : 'Voice supported'}
                  </Badge>
                )}
              </div>
              <Textarea
                id="description" required minLength={5}
                value={description + (interimTranscript ? ' ' + interimTranscript : '')}
                onChange={(e) => { setDescription(e.target.value); setInputMethod('text') }}
                placeholder="Type your emergency description, or press the microphone and speak…"
                rows={5}
              />
              {voiceSupported && (
                <div className="flex gap-2">
                  {!listening ? (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={startListening}>
                      <Mic className="h-3.5 w-3.5" /> 🎤 Speak Emergency
                    </Button>
                  ) : (
                    <Button type="button" variant="destructive" size="sm" className="gap-1.5" onClick={stopListening}>
                      <Square className="h-3.5 w-3.5" /> Stop
                    </Button>
                  )}
                  {inputMethod === 'voice' && description && (
                    <Badge variant="outline" className="text-[9px] gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5 text-sev-LOW" /> Recognized — review & edit before submit
                    </Badge>
                  )}
                </div>
              )}
              {!voiceSupported && (
                <p className="text-[11px] text-muted-foreground">Voice input not supported in this browser — type your description.</p>
              )}
            </div>

            {/* Auto GPS location */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Navigation className="h-3.5 w-3.5" /> Location</Label>
              {gpsStatus === 'requesting' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-md border border-border bg-card/40">
                  <Loader2 className="h-4 w-4 animate-spin" /> Requesting GPS permission…
                </div>
              )}
              {gpsStatus === 'success' && gps && (
                <div className="rounded-md border border-sev-LOW/40 bg-sev-LOW/10 p-3 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-1.5 text-sev-LOW">
                    <MapPin className="h-4 w-4" /> Location detected automatically
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Latitude:</span>
                      <p className="font-mono">{gps.lat.toFixed(5)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Longitude:</span>
                      <p className="font-mono">{gps.lng.toFixed(5)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Accuracy:</span>
                      <p className="font-mono">{gps.accuracy.toFixed(0)} meters</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Captured:</span>
                      <p className="font-mono">{new Date(gps.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                  {locationName && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {locationNameLoading ? 'Resolving location name…' : locationName}
                    </p>
                  )}
                  {/* Mini Leaflet map */}
                  <MiniMap lat={gps.lat} lng={gps.lng} />
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={requestGps}>
                      <RefreshCw className="h-3 w-3" /> Retry Location
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => setMapPicker(true)}>
                      <Edit3 className="h-3 w-3" /> Adjust Pin
                    </Button>
                  </div>
                </div>
              )}
              {(gpsStatus === 'denied' || gpsStatus === 'error') && (
                <div className="rounded-md border border-sev-MEDIUM/40 bg-sev-MEDIUM/10 p-3 space-y-2">
                  <p className="text-sm text-sev-MEDIUM flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" /> Unable to automatically detect your location.
                  </p>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setMapPicker(true)}>
                    <Crosshair className="h-3 w-3" /> Select Location on Map
                  </Button>
                </div>
              )}
            </div>

            {/* Manual map picker */}
            {mapPicker && (
              <div className="rounded-md border border-border bg-card/40 p-3 space-y-2">
                <p className="text-xs font-medium">Enter coordinates manually:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" step="any" placeholder="Latitude (e.g. 27.7172)" value={manualLat} onChange={(e) => setManualLat(e.target.value)} />
                  <Input type="number" step="any" placeholder="Longitude (e.g. 85.324)" value={manualLng} onChange={(e) => setManualLng(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={applyManualLocation}>Set Location</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setMapPicker(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Optional photo upload */}
            <div className="space-y-1.5">
              <Label htmlFor="photo" className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Photo <span className="text-muted-foreground text-[10px]">(optional)</span></Label>
              <div className="flex items-center gap-3">
                <label htmlFor="photo" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border hover:bg-accent/40 transition text-sm">
                    <Upload className="h-4 w-4" />
                    {imageMeta ? imageMeta.filename : 'Choose photo'}
                  </div>
                  <input id="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onFile} className="hidden" />
                </label>
                {imageMeta && (
                  <>
                    <span className="text-xs text-muted-foreground">{(imageMeta.size! / 1024).toFixed(0)} KB · {imageMeta.contentType}</span>
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={clearImage}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
              {imagePreview && (
                <img src={imagePreview} alt="preview" className="mt-2 max-h-40 rounded-md border border-border" />
              )}
            </div>

            {/* Citizen identity — auto-attached (read-only, for transparency) */}
            {user && (
              <div className="rounded-md border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                <p className="font-medium">Report will be submitted as:</p>
                <p>{user.name} ({user.role.replace(/_/g, ' ').toLowerCase()}) — identity auto-attached from your account.</p>
              </div>
            )}

            <Button type="submit" className="w-full gap-2" disabled={submitting || !gps}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Submitting…' : 'Submit Emergency Report'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Mini Leaflet map (client-only, dynamic import to avoid SSR window issues) ──
import dynamic from 'next/dynamic'
const MiniMapInner = dynamic(() => import('./mini-map').then((m) => m.MiniMapInner), {
  ssr: false,
  loading: () => <div className="h-40 rounded-md map-tile-bg flex items-center justify-center text-muted-foreground text-xs">Loading map…</div>,
})
function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  return <MiniMapInner lat={lat} lng={lng} />
}
