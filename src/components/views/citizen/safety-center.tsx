'use client'

// Citizen Safety Center — the citizen-side suite that feeds the officer
// command center: One-Tap SOS + AI Triage, Family Safety Circle, Safe Check-In,
// AI Safety Guide, Offline Emergency Card, Crowdsourced Hazard Map, Relief
// Requests, Shelter Feedback, Verified Alerts, Community Volunteers,
// Accessible Mode and EN/TE/HI multilingual UI.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, apiDelete } from '@/lib/api-client'
import { toast } from 'sonner'
import {
  Siren, HeartPulse, Users, MapPinOff, ShieldCheck, CloudRain, Droplets,
  Package, Home, BellRing, HandHeart, Accessibility, Languages, WifiOff,
  Loader2, Phone, Trash2, Volume2, RefreshCw, Flame, AlertTriangle, Zap, Mail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UI_STRINGS, speak, type LanguageCode } from '@/lib/services/citizen-safety-service'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'

// ─── Small shared pieces ─────────────────────────────────────────────────────

const SEV_STYLE: Record<string, string> = {
  CRITICAL: 'bg-sev-CRITICAL/15 text-sev-CRITICAL border-sev-CRITICAL',
  HIGH: 'bg-sev-HIGH/15 text-sev-HIGH border-sev-HIGH',
  MEDIUM: 'bg-sev-MEDIUM/15 text-sev-MEDIUM border-sev-MEDIUM',
  LOW: 'bg-emerald-500/15 text-emerald-600 border-emerald-500',
}

function getPosition(): Promise<{ coords: { latitude: number; longitude: number; accuracy?: number } } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p: any) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })
}

// ─── 6. Offline Emergency Card (cached to localStorage, shown offline) ───────

function OfflineCard({ name, lang }: { name: string; lang: LanguageCode }) {
  const [online, setOnline] = useState(true)
  const card = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('rf_emergency_card') || 'null')
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      'rf_emergency_card',
      JSON.stringify({
        name,
        updated: new Date().toISOString(),
        contacts: card?.contacts ?? null,
        bloodType: card?.bloodType ?? '',
        allergies: card?.allergies ?? '',
      })
    )
  }, [name, card])

  const t = UI_STRINGS[lang]
  return (
    <Card className={cn('border-2', online ? 'border-border' : 'border-sev-HIGH')}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {online ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-sev-HIGH" />}
          {t.offlineCard}
          {!online && <Badge className="bg-sev-HIGH/15 text-sev-HIGH border-sev-HIGH">OFFLINE</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-destructive" /> Emergency: <span className="font-bold">112</span></div>
        <div className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-destructive" /> Ambulance: <span className="font-bold">108</span></div>
        <div className="text-xs text-muted-foreground">Blood type: {card?.bloodType || '—'}</div>
        <div className="text-xs text-muted-foreground">Allergies: {card?.allergies || '—'}</div>
        {card?.contacts?.length > 0 && (
          <div className="sm:col-span-2 text-xs">
            <p className="font-medium mb-1">Trusted contacts:</p>
            {card.contacts.map((c: any, i: number) => (
              <p key={i} className="font-mono">{c.name} · {c.phone}</p>
            ))}
          </div>
        )}
        <p className="sm:col-span-2 text-[10px] text-muted-foreground">
          Saved on this device — available even without network.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── 1+2. One-Tap SOS + AI Triage ────────────────────────────────────────────

interface Triage {
  severity: string
  urgencyScore: number
  incidentType: string
  immediateGuidance: string
  source: 'ai' | 'demo'
}

function SosSection({ lang, big }: { lang: LanguageCode; big: boolean }) {
  const t = UI_STRINGS[lang]
  const [desc, setDesc] = useState('')
  const [triage, setTriage] = useState<Triage | null>(null)
  const [busy, setBusy] = useState<'triage' | 'sos' | null>(null)

  const doTriage = async () => {
    if (desc.trim().length < 5) return toast.error(t.describeEmergency)
    setBusy('triage')
    try {
      const res = await apiPost<{ triage: Triage }>('/api/citizen/sos/triage', { description: desc, language: lang })
      setTriage(res.triage)
      if (big) speak(res.triage.immediateGuidance, lang)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const sendSos = async () => {
    setBusy('sos')
    try {
      const pos = await getPosition()
      const res = await apiPost<{ incidentCode: string; severity: string; guidance: string }>('/api/citizen/sos', {
        description: desc || undefined,
        latitude: pos?.coords.latitude,
        longitude: pos?.coords.longitude,
        locationAccuracy: pos?.coords.accuracy,
        language: lang,
      })
      toast.success(`SOS ${res.incidentCode} sent — ${res.severity}`, { description: res.guidance })
      if (big) speak('SOS sent. Help has been notified.', lang)
      setTriage(null)
      setDesc('')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Siren className="h-4 w-4 text-destructive" />{t.sosTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t.sosDesc}</p>
        <Button
          size="lg"
          variant="destructive"
          className={cn('w-full font-bold tracking-wide', big && 'text-2xl py-12 animate-pulse')}
          onClick={sendSos}
          disabled={busy !== null}
        >
          {busy === 'sos' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Siren className={big ? 'h-8 w-8' : 'h-5 w-5'} />}
          {t.sendSos}
        </Button>
        <Textarea
          placeholder={t.describeEmergency}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className={big ? 'min-h-28 text-lg' : 'min-h-20'}
        />
        <Button variant="outline" size={big ? 'lg' : 'sm'} onClick={doTriage} disabled={busy !== null} className="gap-1.5">
          {busy === 'triage' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudRain className="h-3.5 w-3.5" />}
          {t.triage}
        </Button>
        {triage && (
          <div className="rounded-md border border-border p-3 space-y-2">
<div className="flex items-center gap-2">
              <Badge className={SEV_STYLE[triage.severity]}>{triage.severity}</Badge>
              <span className="text-xs text-muted-foreground">
                Urgency {triage.urgencyScore}/100 · {triage.source === 'ai' ? 'AI' : 'demo'} · {triage.incidentType.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-sm">{triage.immediateGuidance}</p>
            {big && (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => speak(triage.immediateGuidance, lang)}>
                <Volume2 className="h-3.5 w-3.5" /> Read aloud
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 3+4. Family Safety Circle + Safe Check-In ───────────────────────────────

interface Contact {
  id: string
  name: string
  phone: string
  email?: string | null
  relation: string
  isPrimary: boolean
  emailVerified: boolean
  notificationStatus?: string | null
  lastNotificationAt?: string | null
}

function CircleSection({ lang, big }: { lang: LanguageCode; big: boolean }) {
  const t = UI_STRINGS[lang]
  const [contacts, setContacts] = useState<Contact[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [relation, setRelation] = useState('FAMILY')
  const [safeMsg, setSafeMsg] = useState('')
  const [selected, setSelected] = useState(new Set<string>())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ contacts: Contact[] }>('/api/citizen/safety-contacts')
      setContacts(res.contacts)
      setSelected(new Set(res.contacts.map((c) => c.id)))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const add = async () => {
    setBusy(true)
    try {
      await apiPost('/api/citizen/safety-contacts', {
        name,
        phone,
        email: email || undefined,
        relation,
        emailVerified: !!email, // Auto-verify if email provided
      })
      setName(''); setPhone(''); setEmail('')
      toast.success('Contact added')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await apiDelete(`/api/citizen/safety-contacts/${id}`)
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const checkIn = async () => {
    setBusy(true)
    try {
      const pos = await getPosition()
      const res = await apiPost<{
        message: string
        whatsapp?: { sent: number; failed: number; unavailable: number }
      }>('/api/citizen/check-in', {
        isSafe: true,
        message: safeMsg || undefined,
        contactIds: [...selected],
        latitude: pos?.coords.latitude,
        longitude: pos?.coords.longitude,
      })

      // Show success message with WhatsApp and email notification status
      let successMsg = "You're marked as Safe."
      if (res.email?.sent > 0) {
        successMsg += " Your Family Safety Circle has been notified by email."
      } else if (res.whatsapp?.sent) {
        successMsg += " Your safety contacts have been notified via WhatsApp."
      } else if (res.whatsapp?.unavailable) {
        successMsg += " WhatsApp notification unavailable."
      } else {
        successMsg += " Your safety contacts have been notified."
      }
      toast.success(successMsg)

      if (big) speak('You are marked safe. Contacts notified.', lang)
      setSafeMsg('')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-emerald-500" />{t.imSafe}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Optional message (e.g. at home, have water)" value={safeMsg} onChange={(e) => setSafeMsg(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
          <Button size={big ? 'lg' : 'default'} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={checkIn} disabled={busy || loading}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HeartPulse className="h-4 w-4" />}
            {t.markSafe}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Users className="h-4 w-4" />{t.safetyCircle} ({contacts.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
          ) : contacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">Add trusted contacts so your safe status can reach them.</p>
          ) : (
            <div className="space-y-1.5">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                  {big && (
                    <input
                      type="checkbox"
                      aria-label={`Share with ${c.name}`}
                      className="h-5 w-5"
                      checked={selected.has(c.id)}
                      onChange={(e) => setSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n })}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      {c.isPrimary && <Badge variant="secondary" className="text-[9px]">PRIMARY</Badge>}
                      {c.emailVerified && (
                        <Badge variant="outline" className="text-[9px] text-emerald-600 border-emerald-600">
                          <Mail className="h-2.5 w-2.5 mr-0.5" />Verified
                        </Badge>
                      )}
                      {c.notificationStatus && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${c.notificationStatus === 'SENT' ? 'text-blue-600 border-blue-600' : c.notificationStatus === 'FAILED' ? 'text-red-600 border-red-600' : 'text-gray-500 border-gray-500'}`}
                        >
                          {c.notificationStatus}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{c.phone} · {c.relation}</p>
                    {c.email && (
                      <p className="text-xs text-muted-foreground truncate">
                        <Mail className="h-3 w-3 inline mr-0.5" />{c.email}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${c.name}`} onClick={() => remove(c.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className={cn('grid gap-2', big ? 'sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-5')}>
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
            <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
            <Input placeholder="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
            <Select value={relation} onValueChange={setRelation}>
              <SelectTrigger className={big ? 'h-12 text-lg' : ''}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FAMILY">Family</SelectItem>
                <SelectItem value="FRIEND">Friend</SelectItem>
                <SelectItem value="NEIGHBOUR">Neighbour</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={add} disabled={busy || !name || !phone} className="gap-1.5"><Users className="h-4 w-4" />{t.addContact}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}



// ─── 5. AI Safety Guide ──────────────────────────────────────────────────────

function GuideSection({ lang, big }: { lang: LanguageCode; big: boolean }) {
  const t = UI_STRINGS[lang]
  const [type, setType] = useState('FLOOD')
  const [context, setContext] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [source, setSource] = useState<'ai' | 'demo' | null>(null)
  const [busy, setBusy] = useState(false)

  const get = async () => {
    setBusy(true)
    try {
      const res = await apiPost<{ steps: string[]; source: 'ai' | 'demo' }>('/api/citizen/safety-guide', {
        disasterType: type, context: context || null, language: lang,
      })
      setSteps(res.steps); setSource(res.source)
      if (big) speak(res.steps.join('. '), lang)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const TYPES = [
    { v: 'FLOOD', icon: Droplets }, { v: 'CYCLONE', icon: CloudRain }, { v: 'EARTHQUAKE', icon: AlertTriangle },
    { v: 'FIRE', icon: Flame }, { v: 'LANDSLIDE', icon: AlertTriangle }, { v: 'MEDICAL', icon: HeartPulse },
  ]
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Zap className="h-4 w-4 text-amber-500" />{t.safetyGuide}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map(({ v, icon: Icon }) => (
            <Button key={v} size={big ? 'lg' : 'sm'} variant={type === v ? 'default' : 'outline'} onClick={() => setType(v)} className="gap-1.5">
              <Icon className="h-3.5 w-3.5" />{v}
            </Button>
          ))}
        </div>
        <Input placeholder="Your situation (optional)" value={context} onChange={(e) => setContext(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
        <Button onClick={get} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}{t.getGuide}
        </Button>
        {steps.length > 0 && (
          <ol className="space-y-1.5 text-sm list-decimal list-inside">
            {steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        )}
        {source && <p className="text-[10px] text-muted-foreground">{source === 'ai' ? 'AI generated — always follow official instructions.' : 'Offline guidance pack (demo mode).'}</p>}
      </CardContent>
    </Card>
  )
}


// ─── 7+8. Crowdsourced Hazard Map + AI verification ──────────────────────────

interface Hazard {
  id: string; hazardType: string; description: string; location: string
  severity: string; status: string; aiConfidence: number | null
  confirmCount: number; verified: boolean; createdAt: string
}

const HAZARD_TYPES = ['FLOODING', 'BLOCKED_ROAD', 'DEBRIS', 'DOWNED_POWER_LINE', 'FIRE', 'STRUCTURAL_DAMAGE', 'LANDSLIDE', 'OTHER']

function HazardSection({ lang, big }: { lang: LanguageCode; big: boolean }) {
  const t = UI_STRINGS[lang]
  const [hazards, setHazards] = useState<Hazard[]>([])
  const [type, setType] = useState('BLOCKED_ROAD')
  const [desc, setDesc] = useState('')
  const [severity, setSeverity] = useState('MEDIUM')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ hazards: Hazard[] }>('/api/citizen/hazards')
      setHazards(res.hazards)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const report = async () => {
    if (desc.trim().length < 5) return toast.error('Describe the hazard briefly')
    setBusy(true)
    try {
      const pos = await getPosition()
      const res = await apiPost<{ message: string }>('/api/citizen/hazards', {
        hazardType: type, description: desc, severity,
        latitude: pos?.coords.latitude, longitude: pos?.coords.longitude,
        language: lang,
      })
      toast.success(res.message)
      setDesc('')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><MapPinOff className="h-4 w-4" />{t.reportHazard}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={cn('grid gap-2', big ? 'sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3')}>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className={big ? 'h-12 text-lg' : ''}><SelectValue /></SelectTrigger>
              <SelectContent>
                {HAZARD_TYPES.map((h) => <SelectItem key={h} value={h}>{h.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className={big ? 'h-12 text-lg' : ''}><SelectValue /></SelectTrigger>
              <SelectContent>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={report} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPinOff className="h-4 w-4" />}{t.reportHazard}
            </Button>
          </div>
          <Textarea placeholder="What do you see? (blocked road, flooding depth, damage…)" value={desc} onChange={(e) => setDesc(e.target.value)} className={big ? 'min-h-24 text-lg' : ''} />
          <p className="text-[10px] text-muted-foreground">
            AI verification merges duplicate nearby reports and computes a confidence score before it reaches officers.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            {t.hazardMap}
            <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={load}><RefreshCw className="h-3 w-3" />Refresh</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
          ) : hazards.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No hazards reported in the last 72 hours.</p>
          ) : (
            <div className="space-y-2">
              {hazards.map((h) => (
                <div key={h.id} className="rounded-md border border-border p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className={SEV_STYLE[h.severity]}>{h.hazardType.replace(/_/g, ' ')}</Badge>
                    {h.verified && <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500">VERIFIED</Badge>}
                    {h.status === 'RESOLVED' && <Badge variant="outline">RESOLVED</Badge>}
                    <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                      {h.aiConfidence != null ? `${Math.round(h.aiConfidence * 100)}% confidence · ` : ''}×{h.confirmCount}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{h.description}</p>
                  <p className="text-xs text-muted-foreground">{h.location}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


// ─── 12+13. Relief Need Request + Shelter Feedback ───────────────────────────

const NEEDS = ['FOOD', 'WATER', 'MEDICAL', 'SHELTER', 'CLOTHING', 'RESCUE', 'POWER', 'OTHER']

function ReliefSection({ big }: { big: boolean }) {
  const [needType, setNeedType] = useState('FOOD')
  const [quantity, setQuantity] = useState('')
  const [location, setLocation] = useState('')
  const [urgency, setUrgency] = useState('MEDIUM')
  const [notes, setNotes] = useState('')
  const [mine, setMine] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ requests: any[] }>('/api/citizen/relief-requests')
      setMine(res.requests)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!location.trim()) return toast.error('Location is required')
    setBusy(true)
    try {
      const pos = await getPosition()
      await apiPost('/api/citizen/relief-requests', {
        needType, quantity: quantity || undefined, location, urgency, notes: notes || undefined,
        latitude: pos?.coords.latitude, longitude: pos?.coords.longitude,
      })
      toast.success('Relief request sent to the command center')
      setQuantity(''); setNotes(''); setLocation('')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Package className="h-4 w-4" />Request Relief</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className={cn('grid gap-2', big ? 'sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
            <Select value={needType} onValueChange={setNeedType}>
              <SelectTrigger className={big ? 'h-12 text-lg' : ''}><SelectValue /></SelectTrigger>
              <SelectContent>{NEEDS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Quantity (e.g. family of 4, 2 days)" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
            <Input placeholder="Your location / landmark" value={location} onChange={(e) => setLocation(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger className={big ? 'h-12 text-lg' : ''}><SelectValue /></SelectTrigger>
              <SelectContent>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className={big ? 'min-h-20 text-lg' : ''} />
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}Submit Request
          </Button>
        </CardContent>
      </Card>

      {!loading && mine.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">My Requests</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {mine.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm rounded-md border border-border p-2">
                <Badge variant="outline">{r.needType}</Badge>
                <span className="flex-1 truncate">{r.location}</span>
                <Badge className={SEV_STYLE[r.urgency]}>{r.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}


function ShelterSection({ big }: { big: boolean }) {
  const [shelterName, setShelterName] = useState('')
  const [status, setStatus] = useState('OPEN')
  const [occupancyPct, setOccupancyPct] = useState('')
  const [suppliesNote, setSuppliesNote] = useState('')
  const [shelters, setShelters] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ shelters: any[] }>('/api/citizen/shelter-feedback')
      setShelters(res.shelters)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!shelterName.trim()) return toast.error('Shelter name is required')
    setBusy(true)
    try {
      await apiPost('/api/citizen/shelter-feedback', {
        shelterName, status,
        occupancyPct: occupancyPct ? Number(occupancyPct) : undefined,
        suppliesNote: suppliesNote || undefined,
      })
      toast.success('Thank you — shelter status updated for everyone')
      setOccupancyPct(''); setSuppliesNote('')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const STATUS_STYLE: Record<string, string> = {
    OPEN: 'bg-emerald-500/15 text-emerald-600 border-emerald-500',
    CROWDED: 'bg-sev-MEDIUM/15 text-sev-MEDIUM border-sev-MEDIUM',
    FULL: 'bg-sev-HIGH/15 text-sev-HIGH border-sev-HIGH',
    CLOSED: 'bg-sev-CRITICAL/15 text-sev-CRITICAL border-sev-CRITICAL',
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Home className="h-4 w-4" />Report Shelter Status</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className={cn('grid gap-2', big ? 'sm:grid-cols-2' : 'grid-cols-2')}>
            <Input placeholder="Shelter name / school" value={shelterName} onChange={(e) => setShelterName(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className={big ? 'h-12 text-lg' : ''}><SelectValue /></SelectTrigger>
              <SelectContent>{['OPEN', 'CROWDED', 'FULL', 'CLOSED'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Occupancy %" inputMode="numeric" value={occupancyPct} onChange={(e) => setOccupancyPct(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
            <Input placeholder="Supplies note (water, blankets…)" value={suppliesNote} onChange={(e) => setSuppliesNote(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
          </div>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Home className="h-4 w-4" />}Submit Shelter Update
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Latest Shelter Status</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
          ) : shelters.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">No shelter reports yet.</p>
          ) : (
            <div className="space-y-1.5">
              {shelters.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-sm rounded-md border border-border p-2">
                  <span className="flex-1 truncate font-medium">{s.shelterName}</span>
                  {s.occupancyPct != null && <span className="text-xs text-muted-foreground font-mono">{s.occupancyPct}%</span>}
                  <Badge className={STATUS_STYLE[s.status]}>{s.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


// ─── 14. Verified Alert Feed ─────────────────────────────────────────────────

function AlertsSection() {
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ alerts: any[] }>('/api/citizen/verified-alerts')
      setAlerts(res.alerts)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BellRing className="h-4 w-4" />Verified Alerts
          <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={load}><RefreshCw className="h-3 w-3" />Refresh</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
        ) : alerts.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">No active verified alerts. Only officer/system-verified alerts appear here.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="rounded-md border border-border p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">

                  <Badge className={SEV_STYLE[a.severity]}>{a.severity}</Badge>
                  <Badge variant="outline" className="text-[9px]">OFFICER VERIFIED</Badge>
                  {a.area && <span className="text-[10px] text-muted-foreground">{a.area}</span>}
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">{new Date(a.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-sm font-medium">{a.title}</p>
                <p className="text-sm text-muted-foreground">{a.body}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 15. Community Volunteer Mode ────────────────────────────────────────────

function VolunteerSection({ big }: { big: boolean }) {
  const [registration, setRegistration] = useState<any>(null)
  const [skills, setSkills] = useState('')
  const [availability, setAvailability] = useState('')
  const [areas, setAreas] = useState('')
  const [hasTransport, setHasTransport] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ registration: any }>('/api/citizen/volunteer')
      setRegistration(res.registration)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    setBusy(true)
    try {
      await apiPost('/api/citizen/volunteer', { skills, availability, areas: areas || undefined, hasTransport })
      toast.success('Registration submitted — officers will review it')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const STATUS_TEXT: Record<string, string> = {
    PENDING: 'Under officer review',
    APPROVED: 'Approved — you may be called for suitable tasks',
    ACTIVE: 'Active volunteer',
    INACTIVE: 'Inactive',
    REJECTED: 'Not approved',
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><HandHeart className="h-4 w-4" />Community Volunteer Mode</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
        ) : registration ? (
          <div className="space-y-2">
            <Badge variant="outline">{registration.status}</Badge>
            <p className="text-sm text-muted-foreground">{STATUS_TEXT[registration.status]}</p>
            <p className="text-xs">Skills: {registration.skills}</p>
            <p className="text-xs">Availability: {registration.availability}{registration.hasTransport ? ' · has transport' : ''}</p>
            {registration.status === 'REJECTED' && (
              <Button onClick={() => setRegistration(null)} variant="outline" size="sm">Register again</Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Verified safe citizens can volunteer for suitable assistance tasks. Officers review every registration.
            </p>
            <Input placeholder="Skills (e.g. first aid, swimming, cooking)" value={skills} onChange={(e) => setSkills(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
            <Input placeholder="Availability (e.g. weekends, daytime)" value={availability} onChange={(e) => setAvailability(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
            <Input placeholder="Areas you can cover (optional)" value={areas} onChange={(e) => setAreas(e.target.value)} className={big ? 'h-12 text-lg' : ''} />
            <div className="flex items-center gap-2">
              <Switch checked={hasTransport} onCheckedChange={setHasTransport} id="transport" />
              <label htmlFor="transport" className="text-sm">I have my own transport</label>
            </div>
            <Button onClick={submit} disabled={busy || !skills || !availability} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandHeart className="h-4 w-4" />}Register as Volunteer
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
// ─── Main view (tabs + accessibility + language modes) ───────────────────────

export function CitizenSafetyCenterView() {
  const { user } = useAuth()
  const [lang, setLang] = useState<LanguageCode>('en')
  const [big, setBig] = useState(false)
  const t = UI_STRINGS[lang]

  return (
    <div className="rf-app-main max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header with accessibility + language controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className={cn('text-2xl font-bold tracking-tight', big && 'text-4xl')}>
            {big ? '🛟 ' : ''}{t.safetyCenter}
          </h1>
          <p className={cn('text-sm text-muted-foreground mt-1', big && 'text-lg')}>
            Hi {user?.name?.split(' ')[0]} — your reports feed the officer command center.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={lang} onValueChange={(v) => setLang(String(v) as LanguageCode)}>
            <SelectTrigger className={cn('w-36', big && 'h-12 text-lg')} aria-label={t.language}>
              <Languages className="h-4 w-4" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English (EN)</SelectItem>
              <SelectItem value="te">తెలుగు (TE)</SelectItem>
              <SelectItem value="hi">हिन्दी (HI)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={big ? 'default' : 'outline'}
            size={big ? 'lg' : 'sm'}
            className="gap-1.5"
            onClick={() => { setBig((v) => !v); if (!big) speak(`${t.accessibility} on`, lang) }}
          >
            <Accessibility className="h-4 w-4" />{big ? 'Standard' : t.accessibility}
          </Button>
        </div>
      </div>

      {/* Offline emergency card always visible */}
      <OfflineCard name={user?.name || 'Citizen'} lang={lang} />

      <Tabs defaultValue="sos">
        <TabsList className="flex flex-wrap items-center gap-0.5 overflow-x-auto">
          <TabsTrigger value="sos"><Siren className="h-4 w-4" />{t.sosTitle}</TabsTrigger>
          <TabsTrigger value="circle"><ShieldCheck className="h-4 w-4" />{t.safetyCircle}</TabsTrigger>
          <TabsTrigger value="hazards"><MapPinOff className="h-4 w-4" />{t.hazardMap}</TabsTrigger>
          <TabsTrigger value="relief"><Package className="h-4 w-4" />{t.relief}</TabsTrigger>
          <TabsTrigger value="shelter"><Home className="h-4 w-4" />{t.shelterFeedback}</TabsTrigger>
          <TabsTrigger value="alerts"><BellRing className="h-4 w-4" />{t.alerts}</TabsTrigger>
          <TabsTrigger value="volunteer"><HandHeart className="h-4 w-4" />{t.volunteer}</TabsTrigger>
          <TabsTrigger value="guide"><Zap className="h-4 w-4" />{t.safetyGuide}</TabsTrigger>
        </TabsList>

        <TabsContent value="sos" className="space-y-3"><SosSection lang={lang} big={big} /></TabsContent>
        <TabsContent value="circle" className="space-y-3"><CircleSection lang={lang} big={big} /></TabsContent>
        <TabsContent value="hazards" className="space-y-3"><HazardSection lang={lang} big={big} /></TabsContent>
        <TabsContent value="relief" className="space-y-3"><ReliefSection big={big} /></TabsContent>
        <TabsContent value="shelter" className="space-y-3"><ShelterSection big={big} /></TabsContent>
        <TabsContent value="guide" className="space-y-3"><GuideSection lang={lang} big={big} /></TabsContent>
        <TabsContent value="alerts" className="space-y-3"><AlertsSection /></TabsContent>
        <TabsContent value="volunteer" className="space-y-3"><VolunteerSection big={big} /></TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground">
        Citizen safety suite · All reports are triaged, deduplicated and prioritized before reaching the command center.
        AI features fall back to offline demo mode when the external service is unavailable.
      </p>
    </div>
  )
}
