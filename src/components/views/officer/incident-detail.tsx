'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from '@/lib/use-router'
import { useAuth } from '@/lib/use-auth'
import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api-client'
import { useRealtimeEvents } from '@/lib/use-realtime'
import { toast } from 'sonner'
import {
  ArrowLeft, Loader2, MapPin, Clock, Bot, CheckCircle2, XCircle, AlertTriangle,
  TrendingUp, FileText, Activity, Zap, User, Mail, Send, Phone, MessageCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  IncidentTypeBadge, RiskBadge, StatusBadge, ResourceStatusBadge, RESOURCE_TYPE_LABELS,
} from '@/components/shared/badges'
import { CommandMap } from '@/components/shared/command-map'
import { WeatherCard } from '@/components/shared/weather-card'
import type { Incident, Resource, Approval, DashboardEvent, IncidentStatus, RiskLevel, ResourceStatus } from '@/lib/types'

interface EmailStatusEntry {
  id: string
  emailType: string
  recipientEmail: string  // already masked by backend for officers
  subject: string
  status: string
  sentAt: string | null
  errorMessage: string | null
  createdAt: string
}
interface EmailStatus {
  incidentCode: string
  resolutionEmailSent: boolean
  resolutionEmailSentAt: string | null
  emails: EmailStatusEntry[]
}

export function IncidentDetailView() {
  const { path, navigate } = useRouter()
  const { user } = useAuth()
  const id = path.split('/')[2] || ''
  const [incident, setIncident] = useState<Incident | null>(null)
  const [resources, setResources] = useState<Resource[]>([])
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [approvalReason, setApprovalReason] = useState('')
  const [escalateReason, setEscalateReason] = useState('')
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [whatsappSending, setWhatsappSending] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [inc, res] = await Promise.all([
        apiGet<{ incident: Incident }>(`/api/incidents/${id}`),
        apiGet<{ resources: Resource[] }>('/api/resources'),
      ])
      setIncident(inc.incident)
      setResources(res.resources)
      // Load email status (officer/admin only; backend enforces RBAC)
      if (inc.incident.status === 'RESOLVED' || inc.incident.resolutionEmailSent) {
        try {
          const es = await apiGet<EmailStatus>(`/api/incidents/${id}/email-status`)
          setEmailStatus(es)
        } catch {
          // citizen or responder — no access
        }
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])
  useRealtimeEvents(useCallback((e: DashboardEvent) => {
    if (e.incidentId === id || e.type.startsWith('EMAIL') || e.type === 'INCIDENT_RESOLVED') load()
  }, [id, load]))

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading incident…</div>
  if (!incident) return <div className="p-6 text-center text-muted-foreground">Incident not found.</div>

  const ai = {
    severity: incident.aiSeverity,
    people: incident.aiPeopleAffected,
    urgentNeeds: safeJsonArr(incident.aiUrgentNeeds),
    roadBlocked: incident.aiRoadBlocked,
    infra: safeJsonArr(incident.aiInfrastructureDamage),
    risk: safeJsonArr(incident.aiRiskFactors),
    confidence: incident.aiConfidence,
    missing: safeJsonArr(incident.aiMissingInfo),
    available: incident.aiAvailable,
  }
  const riskReasons = safeJsonArr(incident.riskReasons)
  const weather = incident.weather ? safeJson(incident.weather) : null
  const assignedResource = incident.assignedResourceId ? resources.find((r) => r.id === incident.assignedResourceId) : null

  const pendingApproval = incident.approvals?.find((a) => a.decision === 'PENDING')
  const canApprove = user?.role === 'DISASTER_OFFICER' || user?.role === 'ADMIN'
  const canAdvance = user?.role === 'RESPONDER' || user?.role === 'DISASTER_OFFICER' || user?.role === 'ADMIN'

  const approve = async (decision: 'approve' | 'reject') => {
    if (!pendingApproval) return
    setActionLoading(true)
    try {
      await apiPost(`/api/approvals/${pendingApproval.id}/${decision}`, { reason: approvalReason || `${decision}d by ${user?.name}` })
      toast.success(`Assignment ${decision}d`)
      setApprovalReason('')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const advance = async (stage: 'ACK' | 'START' | 'ARRIVE' | 'RESOLVE') => {
    setActionLoading(true)
    try {
      await apiPatch(`/api/incidents/${id}/response`, { stage })
      toast.success(`Response advanced: ${stage}`)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const escalate = async () => {
    setActionLoading(true)
    try {
      await apiPost(`/api/incidents/${id}/escalate`, { reason: escalateReason || 'Manual escalation', level: 2 })
      toast.success('Incident escalated')
      setEscalateReason('')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const reassess = async () => {
    setActionLoading(true)
    try {
      await apiPut(`/api/incidents/${id}/reassess`, { reason: 'Officer-triggered re-evaluation' })
      toast.success('Re-evaluation triggered')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const retryEmail = async (emailNotificationId: string) => {
    setRetryingId(emailNotificationId)
    try {
      await apiPost(`/api/incidents/${id}/retry-report-email`, { emailNotificationId })
      toast.success('Email retry: sent successfully')
      load()
    } catch (e: any) {
      // The retry endpoint returns 422 with an error message when SMTP is unavailable
      toast.error(e.message || 'Email retry failed')
      load()
    } finally {
      setRetryingId(null)
    }
  }

  const sendReport = async () => {
    setActionLoading(true)
    try {
      const res = await apiPost<{ ok: boolean; alreadySent?: boolean; message?: string }>(`/api/incidents/${id}/send-report`)
      if (res.alreadySent) toast.info(res.message)
      else toast.success('Report email workflow triggered')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const sendWhatsAppReport = async () => {
    setWhatsappSending(true)
    try {
      const res = await apiPost<{ sent: boolean; phone?: string; skipped?: boolean; reason?: string; error?: string; messageId?: string }>(
        `/api/incidents/${id}/send-whatsapp-report`
      )
      if (res.skipped) {
        toast.warning(`WhatsApp skipped: ${res.reason}`)
      } else if (res.sent) {
        toast.success(`WhatsApp report sent to ${res.phone}`)
      } else {
        toast.error(`WhatsApp send failed: ${res.error || 'Provider not configured — check .env'}`)
      }
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setWhatsappSending(false)
    }
  }

  return (
    <div className="p-4 md:p-6 grid lg:grid-cols-3 gap-4 lg:gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/incidents')} className="gap-1.5 mb-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to incidents
        </Button>

        {/* Header */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="font-mono text-sm text-primary font-bold">{incident.incidentCode}</span>
              <IncidentTypeBadge type={incident.type} />
              <StatusBadge status={incident.status as IncidentStatus} />
              {incident.riskLevel && <RiskBadge level={incident.riskLevel as RiskLevel} score={incident.riskScore ?? undefined} />}
              {incident.duplicateFlag && <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/30">POSSIBLE DUPLICATE</Badge>}
              {incident.escalationLevel > 0 && <Badge variant="outline" className="text-[9px] text-red-400 border-red-500/30">LEVEL {incident.escalationLevel}</Badge>}
              <span className="ml-auto text-xs text-muted-foreground font-mono">{new Date(incident.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm mb-2">{incident.description}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {incident.location} · {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}</p>

            {/* Critical Alert */}
            {(incident.riskLevel === 'CRITICAL' || incident.status === 'ESCALATED') && (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400 font-medium">
                  {incident.status === 'ESCALATED' ? 'This incident has been escalated — immediate attention required' : 'Critical priority — immediate response recommended'}
                </p>
              </div>
            )}

            {/* Citizen contact info — shown to officers/admins */}
            {canApprove && (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Citizen Contact</p>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5"><User className="h-3 w-3 text-muted-foreground" /> {incident.citizenName || incident.User?.name || '—'}</span>
                  {incident.citizenEmail && (
                    <span className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3 w-3" /> {incident.citizenEmail}</span>
                  )}
                  {incident.citizenPhone && (
                    <span className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3 w-3" /> {incident.citizenPhone}</span>
                  )}
                  {incident.language && <Badge variant="outline" className="text-[9px]">{incident.language}</Badge>}
                  {incident.inputMethod && <Badge variant="outline" className="text-[9px]">{incident.inputMethod}</Badge>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Map */}
        <Card>
          <CardContent className="p-0">
            <div className="h-64 rounded-lg overflow-hidden border-b border-border">
              <CommandMap
                incidents={[incident]}
                resources={assignedResource ? [assignedResource] : resources.filter((r) => r.status === 'AVAILABLE').slice(0, 6)}
                selectedIncident={incident.id}
                onSelectIncident={() => {}}
                onOpenIncident={() => {}}
              />
            </div>
          </CardContent>
        </Card>

        {/* AI Analysis */}
        <Card className="rf-ai-card">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> AI Incident Assessment
              <Badge variant="outline" className={ai.available ? 'text-[9px] text-emerald-400 border-emerald-500/30' : 'text-[9px] text-amber-400 border-amber-500/30'}>
                {ai.available ? 'AI POWERED' : 'FALLBACK'}
              </Badge>
              {ai.confidence != null && <span className="text-[10px] text-muted-foreground font-mono ml-auto">confidence {(ai.confidence * 100).toFixed(0)}%</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid sm:grid-cols-2 gap-3 text-sm">
            <Field label="Severity" value={ai.severity || '—'} tone={ai.severity?.toLowerCase() as any} />
            <Field label="People affected (est.)" value={ai.people != null ? String(ai.people) : '—'} />
            <Field label="Road blocked" value={ai.roadBlocked == null ? '—' : ai.roadBlocked ? 'Yes' : 'No'} />
            <Field label="Urgent needs" value={ai.urgentNeeds.length ? ai.urgentNeeds.join(', ') : '—'} />
            <Field label="Infrastructure damage" value={ai.infra.length ? ai.infra.join(', ') : '—'} />
            <Field label="Risk factors" value={ai.risk.length ? ai.risk.join('; ') : '—'} />
            <Field label="Missing info" value={ai.missing.length ? ai.missing.join('; ') : '—'} />
          </CardContent>
        </Card>

        {/* Risk Engine */}
        {incident.riskScore != null && (
          <Card>
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Risk Calculation
                <Badge variant="outline" className="text-[9px]">Prototype decision-support score</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums sev-{incident.riskLevel}">{incident.riskScore}</div>
                  <div className="text-[10px] text-muted-foreground">/ 100</div>
                </div>
                <div className="flex-1">
                  {incident.riskLevel && <RiskBadge level={incident.riskLevel as RiskLevel} />}
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {riskReasons.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 mt-0.5 text-sev-LOW" /> {r}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {weather && (
                <div className="mt-3 pt-3 border-t border-border text-xs">
                  <p className="text-muted-foreground mb-1">Weather context (Open-Meteo):</p>
                  <div className="flex gap-4">
                    <span>🌧 {weather.precipitation}mm</span>
                    <span>💨 {weather.wind}km/h</span>
                    <span>🌡 {weather.temperature}°C</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Current Weather + Environmental Risk */}
        <WeatherCard lat={incident.latitude} lng={incident.longitude} />

        {/* Response tracking */}
        {incident.assignedResourceId && (
          <Card>
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Response Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {assignedResource && (
                <div className="mb-3 flex items-center gap-2 flex-wrap text-sm">
                  <span className="font-mono text-emerald-500">{assignedResource.resourceCode}</span>
                  <span>{assignedResource.name}</span>
                  <ResourceStatusBadge status={assignedResource.status as ResourceStatus} />
                  <span className="text-xs text-muted-foreground">· {RESOURCE_TYPE_LABELS[assignedResource.type]} · capacity {assignedResource.capacity}</span>
                </div>
              )}
              <div className="grid grid-cols-4 gap-2 text-xs">
                <TrackingCell label="Assigned" at={incident.assignedAt} />
                <TrackingCell label="Acknowledged" at={incident.acknowledgedAt} />
                <TrackingCell label="On scene" at={incident.arrivedAt} />
                <TrackingCell label="Resolved" at={incident.resolvedAt} success />
              </div>
              {(incident.acknowledgedAt && incident.assignedAt) && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Acknowledgement time: {Math.round((new Date(incident.acknowledgedAt).getTime() - new Date(incident.assignedAt).getTime()) / 60000)} min
                </p>
              )}
              {canAdvance && incident.status !== 'RESOLVED' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {!incident.acknowledgedAt && <Button size="sm" variant="outline" onClick={() => advance('ACK')} disabled={actionLoading}>Acknowledge</Button>}
                  {!incident.startedAt && <Button size="sm" variant="outline" onClick={() => advance('START')} disabled={actionLoading}>En route</Button>}
                  {!incident.arrivedAt && <Button size="sm" variant="outline" onClick={() => advance('ARRIVE')} disabled={actionLoading}>On scene</Button>}
                  <Button size="sm" className="bg-sev-LOW text-foreground hover:bg-sev-LOW/80" onClick={() => advance('RESOLVE')} disabled={actionLoading}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolve
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Timeline */}
        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Event Timeline
              {incident.events && <Badge variant="secondary" className="text-[9px]">{incident.events.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ol className="relative space-y-2.5 border-l border-border pl-4 ml-2">
              {incident.events?.map((e) => {
                const data = safeJson(e.data)
                return (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[9px] font-mono text-primary border-primary/40">{e.eventType}</Badge>
                      <span className="text-[10px] text-muted-foreground font-mono ml-auto">{new Date(e.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-0.5 text-xs">{data?.label || e.eventType}</p>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>

        {/* Generated report */}
        {incident.report && (
          <Card>
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Automatic Incident Report</CardTitle>
            </CardHeader>
            <CardContent className="p-4 text-xs">
              {(() => {
                const r = safeJson(incident.report!.content)
                return (
                  <div className="space-y-2">
                    <p>{r.summary}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Metric label="Response time" value={r.responseTime != null ? `${r.responseTime} min` : '—'} />
                      <Metric label="Resolution time" value={r.resolutionTime != null ? `${r.resolutionTime} min` : '—'} />
                      <Metric label="Delays" value={String(r.delays)} />
                      <Metric label="Escalations" value={String(r.escalations)} />
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Side panel: approvals + officer actions */}
      <div className="space-y-4">
        {/* Pending approval */}
        {pendingApproval && (
          <Card className="border-sev-HIGH">
            <CardHeader className="pb-2 border-b border-border bg-sev-HIGH/10">
              <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-sev-HIGH" /> Approval Required</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {(() => {
                const rec = safeJson(pendingApproval.recommendation)
                const recommended = rec?.recommended_resource
                return (
                  <div className="space-y-3">
                    {recommended ? (
                      <>
                        <div className="rounded-md border border-border bg-card/40 p-3">
                          <p className="text-xs text-muted-foreground">Recommended resource</p>
                          <p className="mt-1 font-mono text-sm text-primary">{recommended.code} · {recommended.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{recommended.reason}</p>
                          <div className="mt-2 flex gap-4 text-xs">
                            <span>ETA: <span className="font-mono">{recommended.eta_minutes} min</span></span>
                            <span>Dist: <span className="font-mono">{recommended.distance_km} km</span></span>
                            <span>Cap: <span className="font-mono">{recommended.capacity}</span></span>
                          </div>
                        </div>
                        {rec.alternative_resources?.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Alternatives:</p>
                            <div className="space-y-1">
                              {rec.alternative_resources.map((a: any) => (
                                <div key={a.id} className="text-xs flex items-center justify-between">
                                  <span className="font-mono text-muted-foreground">{a.code} · {a.name}</span>
                                  <span className="text-muted-foreground">{a.eta_minutes}min · {a.distance_km}km</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No eligible resource available — escalation recommended.</p>
                    )}

                    {canApprove && (
                      <div className="space-y-2">
                        <Textarea placeholder="Reason / note (optional)" value={approvalReason} onChange={(e) => setApprovalReason(e.target.value)} rows={2} />
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1 gap-1" onClick={() => approve('approve')} disabled={actionLoading || !recommended}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 gap-1 text-destructive" onClick={() => approve('reject')} disabled={actionLoading}>
                            <XCircle className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        )}

        {/* Officer actions */}
        {canApprove && (
          <Card>
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Officer Actions</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div>
                <Textarea placeholder="Escalation reason" value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} rows={2} />
                <Button size="sm" variant="outline" className="mt-2 w-full gap-1.5 text-sev-CRITICAL border-sev-CRITICAL hover:bg-sev-CRITICAL/10" onClick={escalate} disabled={actionLoading}>
                  <AlertTriangle className="h-3.5 w-3.5" /> Escalate (LEVEL 2)
                </Button>
              </div>
              <Separator />
              <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={reassess} disabled={actionLoading}>
                <Activity className="h-3.5 w-3.5" /> Trigger Re-evaluation
              </Button>
              <p className="text-[10px] text-muted-foreground">Re-evaluation will rerun resource optimisation against current conditions.</p>
            </CardContent>
          </Card>
        )}

        {/* AI recommendation history */}
        {incident.recommendations && incident.recommendations.length > 0 && (
          <Card>
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> AI Recommendation Log</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {incident.recommendations.slice(0, 5).map((r) => {
                const payload = safeJson(r.payload)
                const recommended = payload?.recommended_resource
                return (
                  <div key={r.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[9px]">{r.recType}</Badge>
                      <span className="text-[10px] text-muted-foreground font-mono ml-auto">{r.source}</span>
                    </div>
                    {recommended ? (
                      <p className="mt-0.5 text-muted-foreground">{recommended.code} · {recommended.name} · ETA {recommended.eta_minutes}min</p>
                    ) : (
                      <p className="mt-0.5 text-muted-foreground">No eligible resource</p>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Report Email Status — officer/admin only */}
        {canApprove && (incident.status === 'RESOLVED' || emailStatus) && (
          <Card>
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" /> Report Email
                {incident.resolutionEmailSent && (
                  <Badge variant="outline" className="text-[9px] text-sev-LOW border-sev-LOW">attempted</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {!emailStatus ? (
                <p className="text-xs text-muted-foreground">Loading email status…</p>
              ) : emailStatus.emails.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">No report email sent yet.</p>
                  {incident.status === 'RESOLVED' && !incident.resolutionEmailSent && (
                    <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={sendReport} disabled={actionLoading}>
                      <Send className="h-3.5 w-3.5" /> Send Report Email
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {emailStatus.emails.map((e) => (
                    <div key={e.id} className="rounded-md border border-border bg-card/40 p-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[9px]">
                          {e.emailType === 'CITIZEN_RESOLUTION_REPORT' ? 'CITIZEN' : 'OFFICER'}
                        </Badge>
                        {e.status === 'SENT' ? (
                          <Badge variant="outline" className="text-[9px] text-sev-LOW border-sev-LOW">✓ SENT</Badge>
                        ) : e.status === 'FAILED' ? (
                          <Badge variant="outline" className="text-[9px] text-sev-CRITICAL border-sev-CRITICAL">✗ FAILED</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] text-sev-MEDIUM border-sev-MEDIUM">○ PENDING</Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono ml-auto">{e.recipientEmail}</span>
                      </div>
                      {e.sentAt && (
                        <p className="mt-1 text-[10px] text-muted-foreground font-mono">
                          Sent: {new Date(e.sentAt).toLocaleString()}
                        </p>
                      )}
                      {e.status === 'FAILED' && e.errorMessage && (
                        <p className="mt-1 text-[10px] text-sev-CRITICAL/80">{e.errorMessage}</p>
                      )}
                      {e.status === 'FAILED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 w-full gap-1.5 text-xs h-7"
                          onClick={() => retryEmail(e.id)}
                          disabled={retryingId === e.id}
                        >
                          {retryingId === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          {retryingId === e.id ? 'Retrying…' : 'Resend Report'}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* WhatsApp Report — officer/admin only */}
        {canApprove && (
          <Card>
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-emerald-500" /> WhatsApp Report
                <Badge variant="outline" className="text-[9px] text-emerald-600 border-emerald-500/50">
                  citizen
                </Badge>
                {!incident.citizenPhone && (
                  <Badge variant="outline" className="text-[9px] text-sev-MEDIUM border-sev-MEDIUM">
                    no phone
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {incident.citizenPhone ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono text-muted-foreground">{incident.citizenPhone}</span>
                    <Badge variant="outline" className="text-[9px]">registered number</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sends a citizen-safe WhatsApp update to the reporting citizen's registered number.
                    {' '}The message contains incident status only — no internal AI data or resource details.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-600"
                    onClick={sendWhatsAppReport}
                    disabled={whatsappSending}
                  >
                    {whatsappSending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
                    }
                    {whatsappSending ? 'Sending…' : 'Send WhatsApp Report to Citizen'}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">
                    ⚡ This is also sent automatically when AI analysis completes. Use this button to resend manually.
                  </p>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>No phone number registered for this citizen.</p>
                  <p className="text-[10px]">Citizens can add a phone number in their profile settings.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 text-muted-foreground"
                    onClick={sendWhatsAppReport}
                    disabled={whatsappSending}
                  >
                    {whatsappSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                    {whatsappSending ? 'Checking…' : 'Try Send (uses profile phone)'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function safeJson(s: string | null): any {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}
function safeJsonArr(s: string | null): any[] {
  const v = safeJson(s)
  return Array.isArray(v) ? v : []
}
function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm mt-0.5 ${tone ? `sev-${tone}` : ''}`}>{value}</p>
    </div>
  )
}
function TrackingCell({ label, at, success }: { label: string; at: string | null; success?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      {at ? (
        <p className="text-xs font-mono mt-0.5">{new Date(at).toLocaleString()}</p>
      ) : success ? (
        <p className="text-xs text-muted-foreground/60 mt-0.5">—</p>
      ) : (
        <p className="text-xs text-muted-foreground/60 mt-0.5">pending…</p>
      )}
    </div>
  )
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-mono mt-0.5">{value}</p>
    </div>
  )
}
