import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'

// GET /api/analytics — dashboard metrics, ALL derived from the database.
export async function GET(_req: NextRequest) {
  try {
    await requireAuth(['DISASTER_OFFICER', 'ADMIN'])

    const totalIncidents = await db.incident.count()
    const criticalIncidents = await db.incident.count({ where: { riskLevel: 'CRITICAL' } })
    const activeIncidents = await db.incident.count({
      where: { status: { in: ['NEW', 'ANALYZING', 'VERIFICATION', 'PRIORITIZED', 'AWAITING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED', 'ESCALATED'] } },
    })
    const availableResources = await db.resource.count({ where: { status: 'AVAILABLE' } })
    const assignedResources = await db.resource.count({ where: { status: { in: ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE'] } } })
    const unavailableResources = await db.resource.count({ where: { status: 'UNAVAILABLE' } })
    const delayedResponses = await db.incident.count({ where: { status: 'DELAYED' } })
    const escalatedIncidents = await db.incident.count({ where: { status: 'ESCALATED' } })
    const resolvedIncidents = await db.incident.count({ where: { status: { in: ['RESOLVED', 'CLOSED'] } } })
    const pendingApprovals = await db.approval.count({ where: { decision: 'PENDING' } })

    // Average response + resolution times (in minutes) — from resolved incidents only
    const resolved = await db.incident.findMany({
      where: { resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true, acknowledgedAt: true, assignedAt: true },
    })
    let avgResolution = 0
    let avgResponse = 0
    let countResp = 0
    for (const r of resolved) {
      if (r.resolvedAt) {
        avgResolution += (r.resolvedAt.getTime() - r.createdAt.getTime()) / 60000
      }
      if (r.acknowledgedAt && r.assignedAt) {
        avgResponse += (r.acknowledgedAt.getTime() - r.assignedAt.getTime()) / 60000
        countResp++
      }
    }
    avgResolution = resolved.length ? Math.round(avgResolution / resolved.length) : 0
    avgResponse = countResp ? Math.round(avgResponse / countResp) : 0

    // Resource conflicts: assignments in REPLACED status (proxy for conflicts)
    const resourceConflicts = await db.resourceAssignment.count({ where: { status: 'REPLACED' } })

    // Resource utilization = assigned / total
    const totalResources = await db.resource.count()
    const utilization = totalResources ? Math.round(((assignedResources) / totalResources) * 100) : 0

    // Time-series: incidents created per day (last 14 days)
    const since = new Date(Date.now() - 14 * 86400 * 1000)
    const recent = await db.incident.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, type: true, status: true, riskLevel: true },
    })
    const byDay: Record<string, number> = {}
    const byType: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const riskBreakdown: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
    for (const r of recent) {
      const day = r.createdAt.toISOString().slice(0, 10)
      byDay[day] = (byDay[day] || 0) + 1
      byType[r.type] = (byType[r.type] || 0) + 1
      byStatus[r.status] = (byStatus[r.status] || 0) + 1
      if (r.riskLevel) riskBreakdown[r.riskLevel]++
    }

    const timeline = Object.entries(byDay)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, count]) => ({ date, count }))

    return ok({
      totalIncidents,
      criticalIncidents,
      activeIncidents,
      availableResources,
      assignedResources,
      unavailableResources,
      delayedResponses,
      escalatedIncidents,
      resolvedIncidents,
      pendingApprovals,
      avgResponseTimeMin: avgResponse,
      avgResolutionTimeMin: avgResolution,
      resourceConflicts,
      resourceUtilizationPct: utilization,
      timeline,
      byType,
      byStatus,
      riskBreakdown,
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
