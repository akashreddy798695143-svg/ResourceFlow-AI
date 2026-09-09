'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from '@/lib/use-router'
import { apiGet } from '@/lib/api-client'
import { useRealtimeEvents } from '@/lib/use-realtime'
import { toast } from 'sonner'
import { MapPin, Loader2, RefreshCw, HandHeart, Filter, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import dynamic from 'next/dynamic'
import L from 'leaflet'
import { cn } from '@/lib/utils'
import type { VolunteerRegistration, DashboardEvent } from '@/lib/types'

const VolunteerMapInner = dynamic(() => import('./volunteer-map-inner').then((m) => m.VolunteerMapInner), {
  ssr: false,
  loading: () => <div className="h-[500px] rounded-lg bg-muted/30 flex items-center justify-center text-muted-foreground text-sm">Loading map…</div>,
})

const FILTERS = ['ALL', 'AVAILABLE', 'BUSY', 'OFFLINE', 'PENDING', 'ACTIVE']

export function VolunteerMapView() {
  const { navigate } = useRouter()
  const [volunteers, setVolunteers] = useState<VolunteerRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ volunteers: VolunteerRegistration[] }>('/api/admin/volunteers')
      setVolunteers(res.volunteers.filter((v) => v.latitude != null && v.longitude != null))
    } catch (e: any) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeEvents(useCallback((e: DashboardEvent) => { if (e.type.startsWith('VOLUNTEER') || e.type === 'LOCATION_UPDATE') load() }, [load]))

  const filtered = volunteers.filter((v) => {
    if (filter === 'ALL') return true
    if (filter === 'PENDING' || filter === 'ACTIVE') return v.status === filter
    return v.availability === filter
  })

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Volunteer Map</h1>
        <div className="flex gap-2">
          <Filter className="h-4 w-4 text-muted-foreground self-center" />
          <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{FILTERS.map((f) => (<SelectItem key={f} value={f}>{f}</SelectItem>))}</SelectContent></Select>
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2"><VolunteerMapInner volunteers={filtered} /></div>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          <p className="text-xs text-muted-foreground">{filtered.length} volunteers with location</p>
          {filtered.map((v) => (
            <Card key={v.id} className="rf-card-hover">
              <CardContent className="p-2.5">
                <div className="flex items-center gap-1.5 mb-1"><span className="font-medium text-sm">{v.name}</span><span className={cn('h-2 w-2 rounded-full', v.availability === 'AVAILABLE' ? 'bg-emerald-400' : v.availability === 'BUSY' ? 'bg-amber-400' : 'bg-gray-400')} /></div>
                <div className="text-[10px] text-muted-foreground space-y-0.5"><p>Skills: {v.skills}</p><p className="flex items-center gap-0.5"><Navigation className="h-2.5 w-2.5" />{v.latitude?.toFixed(4)}, {v.longitude?.toFixed(4)}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}