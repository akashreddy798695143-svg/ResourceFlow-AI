// Broadcasts events to the real-time hub (mini-services/realtime on port 3003)
// and writes an IncidentEvent + (optionally) an AuditLog row.
import { db } from '@/lib/db'

const HUB_URL = 'http://localhost:3003/broadcast'

export interface DashboardEvent {
  type: string // INCIDENT_CREATED, INCIDENT_UPDATED, RISK_CHANGE, RESOURCE_ASSIGNED, ...
  label: string
  incidentId?: string
  resourceId?: string
  data?: any
  timestamp: string
}

// Fire-and-forget broadcast to the realtime hub. Never throws into the request path.
export async function broadcastEvent(event: Omit<DashboardEvent, 'timestamp'>) {
  const payload: DashboardEvent = { ...event, timestamp: new Date().toISOString() }
  try {
    await fetch(HUB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    // Realtime hub unreachable — app continues (WebSocket reconnects on client)
    console.error('[broadcast] realtime hub unreachable:', e)
  }
}

// Record an incident event (DB) + broadcast to dashboard.
export async function recordIncidentEvent(
  incidentId: string,
  eventType: string,
  data: any,
  broadcast = true
) {
  await db.incidentEvent.create({
    data: { incidentId, eventType, data: JSON.stringify(data ?? {}) },
  })
  if (broadcast) {
    await broadcastEvent({
      type: eventType,
      label: data?.label ?? eventType,
      incidentId,
      data,
    })
  }
}

export interface AuditEntry {
  userId?: string
  role?: string
  action: string
  entityId?: string
  previousState?: string
  newState?: string
  reason?: string
}

export async function recordAudit(entry: AuditEntry) {
  try {
    await db.auditLog.create({ data: entry })
  } catch (e) {
    console.error('[audit] failed to write audit log:', e)
  }
}
