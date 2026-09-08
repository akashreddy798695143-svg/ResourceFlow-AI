// Situation Intelligence API — exposes the real application's
// AI-assisted decision-support layer (priority engine, shortage
// detection, next-best-action, timeline, impact metrics).
// RBAC-filtered; never exposes raw internal analysis to citizens.

import { NextResponse } from 'next/server'
import { requireAuth, handleAuthError, roleAllows } from '@/lib/auth'
import {
  getSituationOverview,
  getIncidentTimeline,
  getImpactMetrics,
} from '@/lib/services/situation-intelligence'
import type { RiskLevel } from '@prisma/client'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()

    const url = new URL(req.url)
    const feature = url.searchParams.get('feature')
    const incidentId = url.searchParams.get('incidentId') || undefined

    if (!feature) {
      // Default: situation overview (ranked incidents + shortages + next-best-action)
      if (!roleAllows('advanced:read', user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.json(await getSituationOverview())
    }

    switch (feature) {
      case 'overview':
        if (!roleAllows('advanced:read', user.role)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        return NextResponse.json(await getSituationOverview())

      case 'timeline':
        if (!incidentId) {
          return NextResponse.json({ error: 'incidentId required' }, { status: 400 })
        }
        if (!roleAllows('advanced:read', user.role)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        return NextResponse.json(await getIncidentTimeline(incidentId))

      case 'impact-metrics':
        if (!roleAllows('advanced:read', user.role)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        return NextResponse.json(await getImpactMetrics())

      default:
        return NextResponse.json({ error: `Unknown feature: ${feature}` }, { status: 400 })
    }
  } catch (e) {
    return handleAuthError(e)
  }
}
