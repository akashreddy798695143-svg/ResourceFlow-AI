'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from '@/lib/use-router'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'
import { useRealtimeEvents } from '@/lib/use-realtime'
import { toast } from 'sonner'
import { HandHeart, MapPin, Loader2, RefreshCw, CheckCircle2, XCircle, Users, Phone, Mail, Clock, Navigation, ShieldCheck, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { VolunteerRegistration, DashboardEvent } from '@/lib/types'

const SF = ['ALL', 'PENDING', 'APPROVED', 'ACTIVE', 'INACTIVE', 'REJECTED']
const AF = ['ALL', 'AVAILABLE', 'BUSY', 'OFFLINE']
const sc: Record<string, string> = { PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30', APPROVED: 'bg-blue-500/15 text-blue-400 border-blue-500/30', ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', INACTIVE: 'bg-gray-500/15 text-gray-400 border-gray-500/30', REJECTED: 'bg-red-500/15 text-red-400 border-red-500/30' }
const ac: Record<string, string> = { AVAILABLE: 'text-emerald-400', BUSY: 'text-amber-400', OFFLINE: 'text-gray-400' }

function timeAgo(date: string | null | undefined): string {
  if (!date) return 'Never'
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export function VolunteerManagementView() {
  const { navigate } = useRouter()
  const [volunteers, setVolunteers] = useState<VolunteerRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [sf, setSf] = useState('ALL')
  const [af, setAf] = useState('ALL')
  const [search, setSearch] = useState('')
  const load = useCallback(async () => { try { const p = new URLSearchParams(); if (sf !== 'ALL') p.set('status', sf); if (af !== 'ALL') p.set('availability', af); const r = await apiGet<{ volunteers: VolunteerRegistration[] }>(`/api/admin/volunteers?${p}`); setVolunteers(r.volunteers) } catch (e: any) { toast.error(e.message) } finally { setLoading(false) } }, [sf, af])
  useEffect(() => { load() }, [load])
  useRealtimeEvents(useCallback((e: DashboardEvent) => { if (e.type.startsWith('VOLUNTEER') || e.type === 'LOCATION_UPDATE') load() }, [load]))
  const review = async (uid: string, d: string) => { setBusy(true); try { await apiPatch('/api/citizen/volunteer', { userId: uid, decision: d }); toast.success(`${d}`); load() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) } }
  const assign = async (vid: string) => { setBusy(true); try { const ir = await apiGet<{ incidents: any[] }>('/api/incidents?status=ASSIGNED&limit=1'); const inc = ir.incidents[0]; if (!inc) { toast.error('No active incidents'); return } await apiPost('/api/admin/volunteers', { volunteerId: vid, incidentId: inc.id, action: 'recommend' }); toast.success('Recommended'); load() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) } }
  const filtered = volunteers.filter((v) => { if (!search) return true; const q = search.toLowerCase(); return v.name?.toLowerCase().includes(q) || v.skills.toLowerCase().includes(q) })
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
  return (<div className="space-y-4">
    <div className="flex items-center justify-between flex-wrap gap-2"><h1 className="text-xl font-bold flex items-center gap-2"><HandHeart className="h-5 w-5 text-primary" /> Volunteers</h1><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => navigate('/volunteer-map')}><MapPin className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button></div></div>
    <div className="flex flex-wrap gap-2 items-center"><Filter className="h-4 w-4 text-muted-foreground" /><Select value={sf} onValueChange={setSf}><SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger><SelectContent>{SF.map((f) => (<SelectItem key={f} value={f}>{f}</SelectItem>))}</SelectContent></Select><Select value={af} onValueChange={setAf}><SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger><SelectContent>{AF.map((f) => (<SelectItem key={f} value={f}>{f}</SelectItem>))}</SelectContent></Select><Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-[200px]" /></div>
    <div className="grid grid-cols-5 gap-2">{[{ l: 'Total', c: volunteers.length }, { l: 'Pending', c: volunteers.filter((v) => v.status === 'PENDING').length }, { l: 'Active', c: volunteers.filter((v) => v.status === 'ACTIVE').length }, { l: 'Avail', c: volunteers.filter((v) => v.availability === 'AVAILABLE').length }, { l: 'Located', c: volunteers.filter((v) => v.latitude && v.locationSharing).length }].map((s) => (<div key={s.l} className="rounded-lg border border-border p-2"><p className="text-[10px] text-muted-foreground">{s.l}</p><p className="text-lg font-bold">{s.c}</p></div>))}</div>
    {filtered.length === 0 ? (<Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No volunteers</CardContent></Card>) : filtered.map((v) => (<Card key={v.id}><CardContent className="p-3"><div className="flex justify-between gap-2 flex-wrap"><div className="flex-1 min-w-[200px]"><VMRow v={v} /></div><VMActions v={v} busy={busy} review={review} assign={assign} /></div></CardContent></Card>))}
  </div>)
}

function VMRow({ v }: { v: VolunteerRegistration }) {
  return (<div><div className="flex items-center gap-1.5 flex-wrap mb-1"><span className="font-medium text-sm">{v.name}</span><Badge variant="outline" className={cn('text-[9px]', sc[v.status] || '')}>{v.status}</Badge>{v.verifiedSafe && <Badge className="bg-emerald-500/15 text-emerald-600 text-[9px]"><ShieldCheck className="h-2 w-2 mr-0.5" />Safe</Badge>}<span className={cn('text-[10px] flex items-center gap-0.5', ac[v.availability] || 'text-gray-400')}><span className={cn('h-1.5 w-1.5 rounded-full', v.availability === 'AVAILABLE' ? 'bg-emerald-400' : v.availability === 'BUSY' ? 'bg-amber-400' : 'bg-gray-400')} />{v.availability}</span></div>
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{v.phone || '—'}</span><span className="flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{v.email || '—'}</span><span>Skills: {v.skills}</span><span>Areas: {v.areas || '—'}</span></div>
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">{v.latitude != null && v.longitude != null && v.locationSharing ? (<span className="flex items-center gap-0.5 text-emerald-500"><Navigation className="h-2.5 w-2.5" />{v.latitude.toFixed(5)}, {v.longitude.toFixed(5)} · {timeAgo(v.locationTimestamp)}</span>) : (<span><MapPin className="h-2.5 w-2.5 inline" /> Not shared</span>)}<span><Clock className="h-2.5 w-2.5 inline" />{new Date(v.createdAt).toLocaleDateString()}</span></div></div>)
}

function VMActions({ v, busy, review, assign }: { v: VolunteerRegistration; busy: boolean; review: (uid: string, d: string) => Promise<void>; assign: (vid: string) => Promise<void> }) {
  return (<div className="flex flex-col gap-1 shrink-0">{v.status === 'PENDING' && (<><Button size="sm" variant="outline" disabled={busy} onClick={() => review(v.userId, 'APPROVED')} className="gap-1 text-xs h-7"><CheckCircle2 className="h-3 w-3 text-emerald-500" />Verify</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => review(v.userId, 'REJECTED')} className="gap-1 text-xs h-7 text-destructive"><XCircle className="h-3 w-3" />Reject</Button></>)}{v.status === 'APPROVED' && (<><Button size="sm" variant="outline" disabled={busy} onClick={() => review(v.userId, 'ACTIVE')} className="text-xs h-7">Activate</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => review(v.userId, 'INACTIVE')} className="text-xs h-7 text-destructive">Deactivate</Button></>)}{v.status === 'ACTIVE' && v.availability === 'AVAILABLE' && (<Button size="sm" variant="outline" disabled={busy} onClick={() => assign(v.id)} className="gap-1 text-xs h-7"><HandHeart className="h-3 w-3" />Assign</Button>)}{v.status === 'ACTIVE' && v.availability !== 'AVAILABLE' && (<Button size="sm" variant="ghost" disabled={busy} onClick={() => review(v.userId, 'INACTIVE')} className="text-xs h-7 text-destructive">Deactivate</Button>)}</div>)
}