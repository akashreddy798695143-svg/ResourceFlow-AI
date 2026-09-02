'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/use-auth'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import { Loader2, Settings, Users, Database, Shield, UserCog, Mail, CheckCircle2, XCircle, Bell, MessageSquare, Smartphone, ListChecks } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { User, Role } from '@/lib/types'

const ROLES: Role[] = ['CITIZEN', 'RESPONDER', 'DISASTER_OFFICER', 'ADMIN']

export function SettingsView() {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<string>('')
  const [editActive, setEditActive] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ users: User[] }>('/api/admin/users')
      setUsers(res.users)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'ADMIN') load()
    else setLoading(false)
  }, [user, load])

  const updateUser = async (id: string) => {
    try {
      await apiPatch('/api/admin/users', { id, role: editRole, active: editActive })
      toast.success('User updated')
      setEditing(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const seed = async () => {
    try {
      const res = await apiPost<{ ok: boolean; message: string }>('/api/admin/seed')
      toast.success(res.message)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  if (user?.role !== 'ADMIN') {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-8 text-center">
            <Shield className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Admin role required to access system settings.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6 text-primary" /> Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage users, resources, and system configuration.</p>
      </div>

      <div className="space-y-4">
        {/* Notification Preferences (all users) */}
        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /> Notification Preferences</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <NotificationPreferencesCard />
          </CardContent>
        </Card>

        {/* Notification Logs (all users — backend filters by role) */}
        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /> Notification Delivery Logs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <NotificationLogsCard />
          </CardContent>
        </Card>

        {/* Demo data */}
        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Demo Data</CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm">Re-seed demo users + resources</p>
              <p className="text-xs text-muted-foreground">Idempotent — only creates missing records.</p>
            </div>
            <Button onClick={seed} variant="outline" size="sm">Re-seed</Button>
          </CardContent>
        </Card>

        {/* User management */}
        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> User Management
              <Badge variant="secondary" className="text-[10px]">{users.length} users</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
            ) : (
              <div className="divide-y divide-border max-h-[60vh] overflow-y-auto rf-scroll">
                {users.map((u) => (
                  <div key={u.id} className="p-3 flex items-center gap-3 hover:bg-accent/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {editing === u.id ? (
                      <div className="flex items-center gap-2">
                        <Select value={editRole} onValueChange={setEditRole}>
                          <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button size="sm" onClick={() => updateUser(u.id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <>
                        <Badge variant="outline" className="text-[9px] font-mono">{u.role.replace(/_/g, ' ')}</Badge>
                        {u.active ? (
                          <Badge variant="outline" className="text-[9px] text-sev-LOW border-sev-LOW">active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] text-sev-CRITICAL border-sev-CRITICAL">inactive</Badge>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(u.id); setEditRole(u.role); setEditActive(u.active ?? true) }}>
                          <UserCog className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email configuration */}
        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Email Service (SMTP)</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <EmailConfigCard />
          </CardContent>
        </Card>

        {/* System info */}
        <Card>
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> System</CardTitle>
          </CardHeader>
          <CardContent className="p-4 text-xs space-y-1.5 font-mono">
            <div className="flex justify-between"><span className="text-muted-foreground">Stack</span><span>Next.js 16 · TypeScript · Prisma/SQLite</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">AI</span><span>z-ai-web-dev-sdk (backend-only)</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Realtime</span><span>socket.io hub @ :3003</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Auth</span><span>JWT + Argon2id · cookie session</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Weather</span><span>Open-Meteo (optional)</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span>1.0 · Hackathon</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function EmailConfigCard() {
  const [config, setConfig] = useState<{ configured: boolean; host: string | null; port: number | null; fromEmail: string | null; secure: boolean } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const c = await apiGet<{ configured: boolean; host: string | null; port: number | null; fromEmail: string | null; secure: boolean }>('/api/admin/email-config')
      setConfig(c)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
  if (!config) return <p className="text-xs text-muted-foreground">Unable to load email configuration.</p>

  return (
    <div className="space-y-3">
      <div className={`rounded-md border p-3 flex items-start gap-2 ${config.configured ? 'border-sev-LOW bg-sev-LOW/20' : 'border-sev-MEDIUM bg-sev-MEDIUM/20'}`}>
        {config.configured ? (
          <CheckCircle2 className="h-4 w-4 text-sev-LOW mt-0.5 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-sev-MEDIUM mt-0.5 shrink-0" />
        )}
        <div className="text-xs">
          <p className={config.configured ? 'text-sev-LOW' : 'text-sev-MEDIUM'}>
            {config.configured ? 'SMTP configured — emails will be sent automatically.' : 'SMTP not configured — resolution emails are recorded as FAILED (demo mode).'}
          </p>
          {!config.configured && (
            <p className="text-muted-foreground mt-1">
              Set <code className="font-mono text-[10px]">SMTP_HOST</code>, <code className="font-mono text-[10px]">SMTP_PORT</code>, <code className="font-mono text-[10px]">SMTP_FROM_EMAIL</code>, <code className="font-mono text-[10px]">SMTP_USERNAME</code>, <code className="font-mono text-[10px]">SMTP_PASSWORD</code> in the backend environment to enable real email delivery.
            </p>
          )}
        </div>
      </div>
      <div className="text-xs space-y-1.5 font-mono">
        <div className="flex justify-between"><span className="text-muted-foreground">Host</span><span>{config.host || '—'}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Port</span><span>{config.port || '—'}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">From</span><span>{config.fromEmail || '—'}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">TLS/Secure</span><span>{config.secure ? 'yes' : 'no'}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Credentials</span><span className="text-muted-foreground/60">never exposed</span></div>
      </div>
    </div>
  )
}

function NotificationPreferencesCard() {
  const [prefs, setPrefs] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const p = await apiGet<any>('/api/notifications/preferences')
      setPrefs(p)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const update = async (field: 'smsNotifications' | 'emailNotifications' | 'inAppNotifications', value: boolean) => {
    setSaving(true)
    try {
      const updated = await apiPatch<any>('/api/notifications/preferences', { [field]: value })
      setPrefs((p: any) => ({ ...p, ...updated }))
      toast.success('Notification preference updated')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !prefs) return <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-card/40">
          <div className="flex items-center gap-3">
            <Smartphone className="h-4 w-4 text-primary" />
            <div>
              <Label className="text-sm font-medium cursor-pointer">SMS Notifications</Label>
              <p className="text-xs text-muted-foreground">Receive incident + resolution alerts via SMS{prefs.hasPhone ? '' : ' (add a phone number to enable)'}</p>
            </div>
          </div>
          <Switch checked={prefs.smsNotifications} onCheckedChange={(v) => update('smsNotifications', v)} disabled={saving || !prefs.hasPhone} />
        </div>
        <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-card/40">
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-primary" />
            <div>
              <Label className="text-sm font-medium cursor-pointer">Email Notifications</Label>
              <p className="text-xs text-muted-foreground">Receive incident + resolution reports via email</p>
            </div>
          </div>
          <Switch checked={prefs.emailNotifications} onCheckedChange={(v) => update('emailNotifications', v)} disabled={saving} />
        </div>
        <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-card/40">
          <div className="flex items-center gap-3">
            <Bell className="h-4 w-4 text-primary" />
            <div>
              <Label className="text-sm font-medium cursor-pointer">In-App Notifications</Label>
              <p className="text-xs text-muted-foreground">Receive alerts in the dashboard notification bell</p>
            </div>
          </div>
          <Switch checked={prefs.inAppNotifications} onCheckedChange={(v) => update('inAppNotifications', v)} disabled={saving} />
        </div>
      </div>
      {prefs.criticalNonDisablable && (
        <div className="rounded-md border border-sev-MEDIUM/40 bg-sev-MEDIUM/10 p-3 flex items-start gap-2">
          <MessageSquare className="h-4 w-4 text-sev-MEDIUM mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-sev-MEDIUM">Critical notifications</span> (escalations, approval required, response delays) follow system policy and cannot be disabled — they always go out via all available channels.
          </p>
        </div>
      )}
      <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
        <span>Phone: {prefs.hasPhone ? (prefs.phoneVerified ? '✓ verified' : '✗ unverified') : 'not set'}</span>
        <span>Email: {prefs.emailVerified ? '✓ verified' : '✗ unverified'}</span>
      </div>
    </div>
  )
}

function NotificationLogsCard() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ logs: any[] }>('/api/notifications/logs?limit=50')
      setLogs(res.logs)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>

  if (logs.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">No notification delivery logs yet.</div>
  }

  return (
    <ScrollArea className="max-h-96 rf-scroll">
      <div className="divide-y divide-border">
        {logs.map((l) => (
          <div key={l.id} className="p-3 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[9px] font-mono">{l.notificationType}</Badge>
                <Badge variant="outline" className="text-[9px]">{l.channel}</Badge>
                {l.status === 'SENT' && <Badge variant="outline" className="text-[9px] text-sev-LOW border-sev-LOW">✓ SENT</Badge>}
                {l.status === 'FAILED' && <Badge variant="outline" className="text-[9px] text-sev-CRITICAL border-sev-CRITICAL">✗ FAILED</Badge>}
                {l.status === 'PENDING' && <Badge variant="outline" className="text-[9px] text-sev-MEDIUM border-sev-MEDIUM">○ PENDING</Badge>}
                <span className="text-[10px] text-muted-foreground font-mono ml-auto">{new Date(l.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-xs font-medium truncate">{l.title}</p>
              <p className="text-xs text-muted-foreground truncate">{l.recipient}</p>
              {l.errorMessage && <p className="text-[10px] text-sev-CRITICAL/80 mt-0.5 truncate">{l.errorMessage}</p>}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
