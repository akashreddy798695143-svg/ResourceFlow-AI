'use client'
// Resource Conflict Detector card — added to officer/admin command center.
// Uses real data from /api/features/conflicts.
// NEVER fabricates resources or availability.
import { useEffect, useState, useCallback } from 'react'
import { apiGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Loader2, ShieldAlert, MapPin, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ConflictDTO {
  resourceId: string
  resourceCode: string
  resourceName: string
  resourceType: string
  resourceStatus: string
  resourceLocation: { lat: number; lng: number }
  unavailable: boolean
  conflicts: Array<{
    incidentId: string
    incidentCode: string
    incidentType: string
    incidentStatus: string
    incidentPriority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null
    incidentLocation: { lat: number; lng: number }
    assignmentId: string
    distanceKm: number | null
    destination: { lat: number; lng: number; name: string | null } | null
    assignedAt: string
  }>
  recommendation: {
    priorityIncidentId: string | null
    priorityIncidentCode: string | null
    reassign: boolean
    alternativeResource: {
      id: string; code: string; name: string; type: string; distanceKm: number; availabilityStatus: string
    } | null
    summary: string
  }
}

export function ResourceConflictCard() {
  const [data, setData] = useState<{
    available: boolean
    dataUnavailableReason?: string
    conflicts: ConflictDTO[]
    totalConflicts: number
    totalResourcesInConflict: number
    generatedAt: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await apiGet<{ available: boolean; conflicts: ConflictDTO[]; totalConflicts: number; totalResourcesInConflict: number; generatedAt: string; dataUnavailableReason?: string }>('/api/features/conflicts')
      setData(r)
    } catch (e: any) {
      setError(e?.message || 'Failed to load conflicts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Refresh every 30s for live updates
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              AI Resource Conflict Detector
            </CardTitle>
            <CardDescription className="text-xs">
              Detects double-assignments and resources assigned while unavailable.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !data && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conflict scan…
          </div>
        )}
        {error && (
          <div className="text-xs text-sev-CRITICAL flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </div>
        )}
        {data && !data.available && (
          <div className="text-xs text-muted-foreground italic">DATA UNAVAILABLE — conflict scan could not run.</div>
        )}
        {data && data.available && (
          <>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant={data.totalResourcesInConflict > 0 ? 'destructive' : 'secondary'} className="font-mono">
                {data.totalResourcesInConflict} resource(s) in conflict
              </Badge>
              <span className="text-muted-foreground">{data.totalConflicts} conflict incident refs</span>
              <span className="ml-auto text-muted-foreground text-[10px]">Updated {new Date(data.generatedAt).toLocaleTimeString()}</span>
            </div>
            {data.totalResourcesInConflict === 0 && (
              <div className="text-sm text-sev-LOW">✓ No resource conflicts detected.</div>
            )}
            {data.conflicts.map((c) => (
              <div key={c.resourceId} className="border border-sev-CRITICAL/40 bg-sev-CRITICAL/10 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-sev-CRITICAL">{c.resourceCode}</span>
                    <span className="text-xs">{c.resourceName}</span>
                    <Badge variant="outline" className="text-[10px]">{c.resourceType}</Badge>
                  </div>
                  {c.unavailable && (
                    <Badge variant="destructive" className="text-[10px]">UNAVAILABLE</Badge>
                  )}
                </div>
                <div className="text-xs font-semibold text-sev-CRITICAL flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  RESOURCE CONFLICT DETECTED
                </div>
                <div className="grid gap-2">
                  {c.conflicts.map((conflict) => (
                    <div key={conflict.assignmentId} className={cn('rounded-md p-2 text-xs border', conflict.incidentId === c.recommendation.priorityIncidentId ? 'border-sev-CRITICAL/40 bg-sev-CRITICAL/5' : 'border-border bg-card/40')}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono">{conflict.incidentCode}</span>
                        <Badge variant="outline" className="text-[9px]">{conflict.incidentType}</Badge>
                      </div>
                      <div className="text-muted-foreground mt-1 flex items-center gap-3">
                        <span>Status: {conflict.incidentStatus}</span>
                        {conflict.incidentPriority && (
                          <span>Priority: <strong>{conflict.incidentPriority}</strong></span>
                        )}
                        {conflict.distanceKm != null && (
                          <span className="font-mono">≈ {conflict.distanceKm.toFixed(1)} km away</span>
                        )}
                      </div>
                      {conflict.destination && (
                        <div className="text-muted-foreground mt-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> Destination: {conflict.destination.name ?? '(unnamed)'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-2 text-xs space-y-1">
                  <p className="font-semibold">AI Recommendation</p>
                  <p>{c.recommendation.summary}</p>
                  {c.recommendation.alternativeResource && (
                    <p className="text-muted-foreground">
                      → Suggested alternative: <strong className="text-foreground">{c.recommendation.alternativeResource.code}</strong> ({c.recommendation.alternativeResource.name}), {c.recommendation.alternativeResource.distanceKm.toFixed(1)} km from priority incident
                    </p>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}
