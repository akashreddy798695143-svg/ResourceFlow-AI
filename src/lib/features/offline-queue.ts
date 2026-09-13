// Offline Emergency Report Queue — client-side library.
// Keeps an idempotency key per report. Surfaces the three explicit states:
//   PENDING SYNC → SYNCING → SYNCED (SERVER RECEIVED) / FAILED (LOCAL SAVED only)
// Distinguishes LOCAL SAVED from SERVER RECEIVED clearly.
import { apiPost } from '@/lib/api-client'

export type SyncState = 'PENDING_SYNC' | 'SYNCING' | 'SYNCED' | 'FAILED'

export interface QueuedReport {
  id: string // client-generated UUID (also the idempotency key)
  idempotencyKey: string // mirror of id
  payload: {
    idempotencyKey?: string
    incidentType: string
    description: string
    latitude: number
    longitude: number
    location?: string
    language?: string | null
    inputMethod?: 'text' | 'voice'
    locationAccuracy?: number | null
    locationTimestamp?: string | null
    imageMeta?: { filename?: string; size?: number; contentType?: string } | null
  }
  queuedAt: string
  attempt: number
  state: SyncState
  lastError?: string | null
  syncedAt?: string | null
  syncedIncidentCode?: string | null
}

const STORAGE_KEY = 'resourceflow:offline-reports:v1'

export function loadQueue(): QueuedReport[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QueuedReport[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

export function saveQueue(q: QueuedReport[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(q))
  } catch {
    /* ignore */
  }
}

export function addReport(rep: QueuedReport) {
  const q = loadQueue()
  q.push(rep)
  saveQueue(q)
}

export function updateReport(id: string, patch: Partial<QueuedReport>) {
  const q = loadQueue()
  const next = q.map((r) => (r.id === id ? { ...r, ...patch } : r))
  saveQueue(next)
  return next
}

// Try to sync a single report. Preserves the original payload + idempotencyKey.
export async function syncOne(rep: QueuedReport): Promise<{ success: boolean; error?: string; incidentCode?: string }> {
  try {
    updateReport(rep.id, { state: 'SYNCING' })
    const res = await apiPost<{ duplicate?: boolean; incident: { incidentCode: string } }>(`/api/features/offline-sync`, {
      ...rep.payload,
      idempotencyKey: rep.idempotencyKey,
    })
    updateReport(rep.id, {
      state: 'SYNCED',
      syncedAt: new Date().toISOString(),
      syncedIncidentCode: res.incident?.incidentCode || null,
      lastError: null,
    })
    return { success: true, incidentCode: res.incident?.incidentCode }
  } catch (e: any) {
    updateReport(rep.id, { state: 'FAILED', lastError: e?.message || String(e), attempt: (rep.attempt || 0) + 1 })
    return { success: false, error: e?.message || String(e) }
  }
}

export async function syncAll(): Promise<{ synced: number; remaining: number }> {
  const q = loadQueue()
  let synced = 0
  const remaining: QueuedReport[] = []
  for (const rep of q) {
    const r = await syncOne(rep)
    if (r.success) synced++
    else remaining.push({ ...rep, state: 'FAILED' })
  }
  saveQueue(remaining)
  return { synced, remaining: remaining.length }
}

export function clearAll() {
  saveQueue([])
}

export function removeReport(id: string) {
  saveQueue(loadQueue().filter((r) => r.id !== id))
}
