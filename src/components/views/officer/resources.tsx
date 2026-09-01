'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/use-auth'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { useRealtimeEvents } from '@/lib/use-realtime'
import { toast } from 'sonner'
import { Loader2, Package, Plus, CheckCircle2, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResourceStatusBadge, RESOURCE_TYPE_LABELS } from '@/components/shared/badges'
import type { Resource, ResourceStatus, ResourceType, DashboardEvent } from '@/lib/types'

const TYPES: ResourceType[] = ['AMBULANCE', 'RESCUE_TEAM', 'FIRE_TEAM', 'EMERGENCY_VEHICLE', 'MEDICAL_SUPPLY', 'FOOD_SUPPLY', 'WATER_SUPPLY']
const STATUSES: ResourceStatus[] = ['AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'UNAVAILABLE']

export function ResourcesView() {
  const { user } = useAuth()
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [editReason, setEditReason] = useState('')

  // New resource form
  const [name, setName] = useState('')
  const [type, setType] = useState<ResourceType>('RESCUE_TEAM')
  const [lat, setLat] = useState('28.61')
  const [lng, setLng] = useState('77.21')
  const [capacity, setCapacity] = useState('10')
  const [code, setCode] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ resources: Resource[] }>('/api/resources')
      setResources(res.resources)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeEvents(useCallback((e: DashboardEvent) => {
    if (e.type.startsWith('RESOURCE') || e.type === 'NOTIFICATION') load()
  }, [load]))

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiPost('/api/resources', {
        name, type, latitude: Number(lat), longitude: Number(lng),
        capacity: Number(capacity), resourceCode: code || undefined, status: 'AVAILABLE',
      })
      toast.success('Resource created')
      setShowAdd(false); setName(''); setCode(''); setCapacity('10')
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const updateStatus = async (id: string) => {
    try {
      await apiPatch(`/api/resources/${id}`, { status: editStatus, reason: editReason })
      toast.success('Resource updated')
      setEditing(null); setEditReason('')
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const canManage = user?.role === 'ADMIN' || user?.role === 'DISASTER_OFFICER' || user?.role === 'RESPONDER'
  const canCreate = user?.role === 'ADMIN'

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Resources</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and dispatch emergency resources.</p>
        </div>
        {canCreate && (
          <Button className="ml-auto gap-1.5" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-4 w-4" /> Add Resource
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAdd && canCreate && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <form onSubmit={create} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="code">Code</Label>
                <Input id="code" placeholder="R23" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Rescue Team Charlie" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type">Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as ResourceType)}>
                  <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => <SelectItem key={t} value={t}>{RESOURCE_TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="capacity">Capacity</Label>
                <Input id="capacity" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lat">Latitude</Label>
                <Input id="lat" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lng">Longitude</Label>
                <Input id="lng" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
              <Button type="submit" className="sm:col-span-2 lg:col-span-2">Create Resource</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {resources.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-primary">{r.resourceCode}</span>
                  <ResourceStatusBadge status={r.status} />
                </div>
                <p className="mt-1 font-medium text-sm">{r.name}</p>
                <p className="text-xs text-muted-foreground">{RESOURCE_TYPE_LABELS[r.type]} · capacity {r.capacity}</p>
                <p className="mt-1 text-[10px] text-muted-foreground font-mono">{r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}</p>
                <p className="text-[10px] text-muted-foreground/70">Updated {new Date(r.lastUpdated).toLocaleString()}</p>

                {canManage && (
                  editing === r.id ? (
                    <div className="mt-3 space-y-2">
                      <Select value={editStatus} onValueChange={setEditStatus}>
                        <SelectTrigger><SelectValue placeholder="New status" /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Textarea placeholder="Reason (for unavailable)" value={editReason} onChange={(e) => setEditReason(e.target.value)} rows={2} />
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => updateStatus(r.id)} disabled={!editStatus}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => { setEditing(r.id); setEditStatus(r.status); setEditReason('') }}>
                      Update Status
                    </Button>
                  )
                )}
                {r.status === 'UNAVAILABLE' && (
                  <p className="mt-2 text-[10px] text-sev-CRITICAL flex items-center gap-1">
                    <XCircle className="h-3 w-3" /> Adaptive reassignment will trigger for assigned incidents.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
