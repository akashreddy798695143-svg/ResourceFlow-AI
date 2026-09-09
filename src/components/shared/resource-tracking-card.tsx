'use client'

import { Fragment, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Navigation, CheckCircle2, Play, Pause, Map } from 'lucide-react'
import { ResourceStatusBadge } from '@/components/shared/badges'
import dynamic from 'next/dynamic'
import type { Incident, Resource, ResourceStatus } from '@/lib/types'
import { haversineKm } from '@/lib/agents/resource-agent'

const ResourceTrackerMap = dynamic(
  () => import('@/components/shared/resource-tracker-map'),
    { ssr: false, loading: () => <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">Loading map…</div> }
)

const STATUS_FLOW: { key: string; label: string }[] = [
  { key: 'REQUESTED', label: 'Requested' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'DISPATCHED', label: 'Dispatched' },
  { key: 'EN_ROUTE', label: 'En Route' },
  { key: 'ON_SCENE', label: 'On Scene' },
  { key: 'ARRIVED', label: 'Arrived' },
  { key: 'COMPLETED', label: 'Completed' },
]

function statusOrder(status: string): number {
  const explicit: Record<string, number> = {
    AVAILABLE: 0, REQUESTED: 1, APPROVED: 2, ASSIGNED: 2, DISPATCHED: 3,
    EN_ROUTE: 4, ON_SCENE: 5, ARRIVED: 6, COMPLETED: 7, UNAVAILABLE: -1,
  }
  return explicit[status] ?? 0
}

export function ResourceTrackingCard({
  incident,
  resources,
  onConfirmArrival,
}: {
  incident: Incident
  resources: Resource[]
  onConfirmArrival?: (resourceId: string) => Promise<void>
}) {
  const assigned = incident.assignedResourceId ? resources.find((r) => r.id === incident.assignedResourceId) : null
  const hasDest = incident.resourceDestinationLatitude != null && incident.resourceDestinationLongitude != null
  const [live, setLive] = useState(false)

  let distanceKm: number | null = null
  let etaMin: number | null = null
  if (assigned && hasDest) {
    distanceKm = haversineKm(assigned.latitude, assigned.longitude, incident.resourceDestinationLatitude!, incident.resourceDestinationLongitude!)
    etaMin = Math.round(distanceKm * 3 + 1)
  }
  const currentStep = assigned ? statusOrder(assigned.status) : 0
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 border-border">
        <CardTitle className="text-sm flex items-center gap-2">
          <Map className="h-4 w-4 text-primary" /> Resource & Logistics Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {/* Status progression bar */}
        <div className="flex items-center justify-between text-[10px] font-mono uppercase text-muted-foreground">
          {STATUS_FLOW.map((s, i) => {
            const done = i <= currentStep
            const isLast = i === STATUS_FLOW.length - 1
            return (
              <Fragment key={s.key}>
                <div className="flex flex-col items-center">
                  <div className={`h-2.5 w-2.5 rounded-full border border-white ${done ? 'bg-primary' : 'bg-muted'}`} />
                  <span className={done ? 'text-primary font-medium' : ''} style={{ fontSize: 9 }}>{s.label}</span>
                </div>
                {!isLast && <div className="flex-1 h-0.5" style={{ background: done ? '#3b82f6' : '#e5e7eb', opacity: done ? 0.6 : 0.4 }} />}
              </Fragment>
            )
          })}
        </div>

        {assigned ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-emerald-500">{assigned.resourceCode}</span>
                <strong>{assigned.name}</strong>
                <ResourceStatusBadge status={assigned.status as ResourceStatus} />
              </div>
              <Button
                size="sm"
                variant={live ? 'default' : 'outline'}
                onClick={() => setLive((v) => !v)}
                className={live ? 'bg-primary text-primary-foreground' : ''}
              >
                {live ? <Pause className="h-3.5 w-3.5 mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />} {live ? 'GO LIVE' : 'GO LIVE / NAVIGATE'}
              </Button>
            </div>

            {hasDest && (
              <div className="text-xs text-muted-foreground flex flex-col gap-1">
                <span><Navigation className="h-3 w-3 inline mr-1" />Destination: {incident.resourceDestinationName ?? '—'} ({incident.resourceDestinationType ?? 'INCIDENT'})</span>
                {distanceKm != null && <span>Distance: {Math.round(distanceKm * 100) / 100} km (great-circle)</span>}
                {etaMin != null && <span>Estimated ETA: ~{etaMin} min (approximate)</span>}
              </div>
            )}

            {live && live && (
              <div className="border border-border rounded-md overflow-hidden h-56">
                <ResourceTrackerMap resource={assigned} incident={incident} distanceKm={distanceKm} etaMin={etaMin} />
              </div>
            )}

            {onConfirmArrival && assigned.status !== 'ARRIVED' && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-7 text-xs"
                onClick={() => onConfirmArrival(assigned.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Arrival
              </Button>
            )}
            <div className="text-[10px] text-muted-foreground">
              Current resource location is the last authorized update. Real-time GPS is only shown with explicit consent.
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No resource assigned yet. Assign a resource to enable tracking.</p>
        )}
      </CardContent>
    </Card>
  )
}
