'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiGet } from '@/lib/api-client'
import { useRealtimeEvents } from '@/lib/use-realtime'
import { toast } from 'sonner'
import { Loader2, BarChart3, TrendingUp, AlertTriangle, Clock, Package, CheckCircle2, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { Analytics, DashboardEvent } from '@/lib/types'
import { Button } from '@/components/ui/button'

const RISK_COLORS: Record<string, string> = {
  LOW: '#22c55e', MEDIUM: '#eab308', HIGH: '#f97316', CRITICAL: '#ef4444',
}
const TYPE_COLORS = ['#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#6366f1', '#64748b', '#eab308']

export function AnalyticsView() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Analytics>('/api/analytics')
      setData(d)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeEvents(useCallback((e: DashboardEvent) => {
    if (e.type.startsWith('INCIDENT') || e.type === 'RISK_CALCULATED' || e.type === 'INCIDENT_RESOLVED') load()
  }, [load]))

  const generateSummary = async () => {
    setSummaryLoading(true)
    try {
      const result = await apiGet<{ summary: string }>('/api/analytics/summary')
      setSummary(result.summary)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSummaryLoading(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading analytics…</div>
  if (!data) return <div className="p-6 text-center text-muted-foreground">No analytics available.</div>

  const timelineData = data.timeline.map((t) => ({ date: t.date.slice(5), count: t.count }))
  const typeData = Object.entries(data.byType).map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: v }))
  const riskData = Object.entries(data.riskBreakdown).map(([k, v]) => ({ name: k, value: v }))

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /> Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">All metrics derived from the live database.</p>
      </div>

      <Card className="mb-4 border-primary/30 bg-primary/5">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI disaster situation summary</CardTitle>
          <Button size="sm" variant="outline" onClick={generateSummary} disabled={summaryLoading} className="gap-1.5">
            {summaryLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {summaryLoading ? 'Analysing…' : 'Generate summary'}
          </Button>
        </CardHeader>
        {summary && <CardContent className="pt-2"><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{summary}</p></CardContent>}
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3 mb-4">
        <KPI label="Total Incidents" value={data.totalIncidents} icon={BarChart3} />
        <KPI label="Critical" value={data.criticalIncidents} icon={AlertTriangle} tone="CRITICAL" />
        <KPI label="Active" value={data.activeIncidents} icon={TrendingUp} tone="HIGH" />
        <KPI label="Resolved" value={data.resolvedIncidents} icon={CheckCircle2} tone="LOW" />
        <KPI label="Avg Response (min)" value={data.avgResponseTimeMin} icon={Clock} />
        <KPI label="Avg Resolution (min)" value={data.avgResolutionTimeMin} icon={Clock} />
        <KPI label="Resource Conflicts" value={data.resourceConflicts} icon={AlertTriangle} tone="HIGH" />
        <KPI label="Utilization %" value={data.resourceUtilizationPct} icon={Package} suffix="%" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Timeline */}
        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm">Incidents (last 14 days)</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#f59e0b" fill="url(#colorCount)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk breakdown */}
        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm">Risk Level Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={riskData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                  {riskData.map((e) => <Cell key={e.name} fill={RISK_COLORS[e.name] || '#a3a3a3'} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Type breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm">Incidents by Type</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {typeData.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KPI({ label, value, icon: Icon, tone = 'default', suffix = '' }: { label: string; value: number | string; icon: any; tone?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'default'; suffix?: string }) {
  const toneClass =
    tone === 'CRITICAL' ? 'text-sev-CRITICAL' :
    tone === 'HIGH' ? 'text-sev-HIGH' :
    tone === 'MEDIUM' ? 'text-sev-MEDIUM' :
    tone === 'LOW' ? 'text-sev-LOW' : 'text-foreground'
  return (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${toneClass}`} />
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}{suffix}</div>
    </div>
  )
}
