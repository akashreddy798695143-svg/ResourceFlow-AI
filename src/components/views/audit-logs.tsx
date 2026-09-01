'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiGet } from '@/lib/api-client'
import { toast } from 'sonner'
import { Loader2, ScrollText, Filter } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AuditLog } from '@/lib/types'

const ACTIONS = [
  'LOGIN', 'REGISTER', 'INCIDENT_CREATED', 'AI_ANALYSIS', 'RISK_CALCULATED',
  'RESOURCE_RECOMMENDED', 'APPROVAL_GRANTED', 'APPROVAL_REJECTED', 'RESOURCE_ASSIGNED',
  'RESOURCE_UNAVAILABLE', 'REASSIGNMENT', 'ESCALATION', 'INCIDENT_RESOLVED', 'RESPONSE_DELAYED',
]

const ACTION_TONES: Record<string, string> = {
  LOGIN: 'text-muted-foreground',
  REGISTER: 'text-muted-foreground',
  INCIDENT_CREATED: 'text-sev-MEDIUM',
  AI_ANALYSIS: 'text-primary',
  RISK_CALCULATED: 'text-sev-MEDIUM',
  RESOURCE_RECOMMENDED: 'text-primary',
  APPROVAL_GRANTED: 'text-sev-LOW',
  APPROVAL_REJECTED: 'text-sev-CRITICAL',
  RESOURCE_ASSIGNED: 'text-sev-LOW',
  RESOURCE_UNAVAILABLE: 'text-sev-CRITICAL',
  REASSIGNMENT: 'text-sev-HIGH',
  ESCALATION: 'text-sev-CRITICAL',
  INCIDENT_RESOLVED: 'text-sev-LOW',
  RESPONSE_DELAYED: 'text-sev-CRITICAL',
}

export function AuditLogsView() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  const load = useCallback(async () => {
    try {
      const url = filter === 'ALL' ? '/api/audit?limit=300' : `/api/audit?action=${filter}&limit=300`
      const res = await apiGet<{ logs: AuditLog[] }>(url)
      setLogs(res.logs)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="h-6 w-6 text-primary" /> Audit Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">Tamper-evident record of every meaningful action.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All actions</SelectItem>
              {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : logs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No audit entries.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-[calc(100vh-220px)] overflow-y-auto rf-scroll">
              {logs.map((l) => (
                <div key={l.id} className="p-3 flex items-start gap-3 hover:bg-accent/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[9px] font-mono ${ACTION_TONES[l.action] || ''}`}>{l.action}</Badge>
                      {l.role && <Badge variant="secondary" className="text-[9px]">{l.role.replace(/_/g, ' ')}</Badge>}
                      {l.user && <span className="text-xs text-muted-foreground">{l.user.name} · {l.user.email}</span>}
                      <span className="text-[10px] text-muted-foreground font-mono ml-auto">{new Date(l.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="mt-1 text-xs space-y-0.5">
                      {l.entityId && <p className="text-muted-foreground font-mono">entity: {l.entityId}</p>}
                      {l.previousState && <p className="text-muted-foreground">prev: {l.previousState}</p>}
                      {l.newState && <p className="text-muted-foreground">new: {l.newState}</p>}
                      {l.reason && <p className="text-foreground/80">reason: {l.reason}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
