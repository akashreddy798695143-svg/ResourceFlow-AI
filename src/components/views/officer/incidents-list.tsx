'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from '@/lib/use-router'
import { apiGet } from '@/lib/api-client'
import { useRealtimeEvents } from '@/lib/use-realtime'
import { toast } from 'sonner'
import { Loader2, Filter, Inbox } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IncidentTypeBadge, RiskBadge, StatusBadge } from '@/components/shared/badges'
import type { Incident, IncidentStatus, RiskLevel, DashboardEvent } from '@/lib/types'

const STATUSES = ['NEW', 'ANALYZING', 'VERIFICATION', 'PRIORITIZED', 'AWAITING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED', 'ESCALATED', 'RESOLVED', 'CLOSED']

export function IncidentsListView({ responderMode = false }: { responderMode?: boolean }) {
  const { navigate } = useRouter()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ incidents: Incident[] }>('/api/incidents?limit=200')
      setIncidents(res.incidents)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeEvents(useCallback((e: DashboardEvent) => {
    if (e.type.startsWith('INCIDENT') || e.type === 'RISK_CALCULATED' || e.type === 'APPROVAL_GRANTED' || e.type === 'RESOURCE_ASSIGNED') load()
  }, [load]))

  const filtered = incidents.filter((i) => {
    if (statusFilter !== 'ALL' && i.status !== statusFilter) return false
    if (search) {
      const s = search.toLowerCase()
      if (!i.incidentCode.toLowerCase().includes(s) && !i.description.toLowerCase().includes(s) && !i.location.toLowerCase().includes(s)) return false
    }
    return true
  })

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">{responderMode ? 'Assigned Incidents' : 'Incidents'}</h1>
          <p className="text-sm text-muted-foreground mt-1">{responderMode ? 'Update resource status and advance the response lifecycle.' : 'Browse, filter and inspect every incident.'}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Search code, location, desc…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No incidents match the filters.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((inc) => (
            <Card key={inc.id} className="hover:bg-accent/30 transition cursor-pointer">
              <CardContent className="p-4" onClick={() => navigate(`/incidents/${inc.id}`)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-primary">{inc.incidentCode}</span>
                  <IncidentTypeBadge type={inc.type} />
                  <StatusBadge status={inc.status as IncidentStatus} />
                  {inc.riskLevel && <RiskBadge level={inc.riskLevel as RiskLevel} score={inc.riskScore ?? undefined} />}
                  {inc.duplicateFlag && <Badge variant="outline" className="text-[9px] text-sev-MEDIUM border-sev-MEDIUM">POSSIBLE DUPLICATE</Badge>}
                  {inc.escalationLevel > 0 && <Badge variant="outline" className="text-[9px] text-sev-CRITICAL border-sev-CRITICAL">L{inc.escalationLevel}</Badge>}
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                    {new Date(inc.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1.5 text-sm line-clamp-2">{inc.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">{inc.location} · reported by {inc.reportedBy?.name || '—'}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
