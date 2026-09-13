'use client'
// Offline Emergency Report Queue status banner.
// Preserves ALL payload fields described in the spec.
// Shows: OFFLINE MODE / LOCAL SAVED / PENDING SYNC / SYNCING / SYNCED (SERVER RECEIVED) / FAILED.
import { useEffect, useState, useCallback } from 'react'
import { Wifi, WifiOff, Loader2, CheckCircle2, XCircle, Trash2, RefreshCw, Cloud, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { loadQueue, syncAll, removeReport, type QueuedReport } from '@/lib/features/offline-queue'
import { toast } from 'sonner'

export function OfflineQueueStatus() {
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [reports, setReports] = useState<QueuedReport[]>([])
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(() => setReports(loadQueue()), [])

  useEffect(() => {
    refresh()
    const handleOnline = () => {
      setOnline(true)
      // Trigger immediate sync on reconnect
      void doSync()
    }
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refresh])

  const doSync = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await syncAll()
      if (res.synced > 0) {
        toast.success(`${res.synced} queued report(s) synced to the server.`)
      }
      if (res.remaining > 0) {
        toast.warning(`${res.remaining} report(s) still pending — retry when online.`)
      }
      refresh()
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }, [refresh])

  const pending = reports.filter((r) => r.state === 'PENDING_SYNC' || r.state === 'SYNCING' || r.state === 'FAILED')
  const synced = reports.filter((r) => r.state === 'SYNCED')

  return (
    <Card className={cn('border-border', online ? '' : 'border-sev-MEDIUM/40')}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium">
            {online ? (
              <Wifi className="h-4 w-4 text-sev-LOW" />
            ) : (
              <WifiOff className="h-4 w-4 text-sev-MEDIUM" />
            )}
            {online ? 'Online' : 'OFFLINE MODE'}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{pending.length} pending</Badge>
            <Badge variant="secondary" className="text-[10px]">{synced.length} synced (SERVER RECEIVED)</Badge>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={doSync} disabled={syncing || !online || pending.length === 0}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync now
            </Button>
          </div>
        </div>

        {!online && (
          <div className="rounded-md border-sev-MEDIUM/40 bg-sev-MEDIUM/10 p-3 text-xs space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-sev-MEDIUM">
              <Cloud className="h-3.5 w-3.5" /> LOCAL SAVED — Emergency report saved securely on this device.
            </div>
            <p className="text-muted-foreground">
              Your report is queued locally with its incident type, description, GPS, timestamp, language, input method and any photo metadata. The server has NOT yet received it.
              We will automatically sync when your internet connection returns.
            </p>
          </div>
        )}

        {reports.length > 0 && (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {reports.map((r) => (
              <div key={r.id} className="rounded-md border-border bg-card/40 p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    {renderStateIcon(r.state)}
                    <span className="font-mono">{r.payload.incidentType}</span>
                    <span className="text-muted-foreground truncate max-w-[180px]">"{r.payload.description.slice(0, 60)}{r.payload.description.length > 60 ? '…' : ''}"</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="text-[9px]" variant={r.state === 'SYNCED' ? 'secondary' : r.state === 'SYNCING' ? 'default' : 'destructive'}>
                      {labelForState(r.state)}
                    </Badge>
                    {r.state === 'FAILED' && (
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { removeReport(r.id); refresh() }} title="Discard report">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="text-muted-foreground flex items-center flex-wrap gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> queued {new Date(r.queuedAt).toLocaleString()}</span>
                  <span className="font-mono">GPS: ({r.payload.latitude.toFixed(4)}, {r.payload.longitude.toFixed(4)})</span>
                  {r.payload.language && <span>lang={r.payload.language}</span>}
                  {r.payload.inputMethod && <span>method={r.payload.inputMethod}</span>}
                  {r.payload.imageMeta?.filename && <span>📎 {r.payload.imageMeta.filename}</span>}
                  {r.syncedIncidentCode && <span className="font-mono text-sev-LOW">{r.syncedIncidentCode}</span>}
                  {r.lastError && <span className="text-sev-CRITICAL">err: {r.lastError}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function labelForState(s: string): string {
  switch (s) {
    case 'PENDING_SYNC': return 'PENDING SYNC (LOCAL SAVED)'
    case 'SYNCING': return 'SYNCING…'
    case 'SYNCED': return 'SYNCED (SERVER RECEIVED)'
    case 'FAILED': return 'FAILED — WILL RETRY'
    default: return s
  }
}

function renderStateIcon(state: string) {
  if (state === 'SYNCING') return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
  if (state === 'SYNCED') return <CheckCircle2 className="h-3.5 w-3.5 text-sev-LOW" />
  if (state === 'FAILED') return <XCircle className="h-3.5 w-3.5 text-sev-CRITICAL" />
  return <Cloud className="h-3.5 w-3.5 text-sev-MEDIUM" />
}
