// Impact Analytics & Decision-Support API
// Exposes real, database-derived operational intelligence.
// No fabricated statistics. Missing data is clearly labelled.

import { NextResponse } from 'next/server'
import { requireAuth, handleAuthError, roleAllows } from '@/lib/auth'
import {
  getSituationOverview,
  getIncidentTimeline,
  getImpactMetrics,
} from '@/lib/services/situation-intelligence'
import { getAdvancedOverview } from '@/lib/services/advanced-service'
import { generateRiskForecasts } from '@/lib/services/risk-forecast-service'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const url = new URL(req.url)
    const feature = url.searchParams.get('feature')

    if (!feature) {
      // Default: combined operational intelligence snapshot
      if (!roleAllows('advanced:read', user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const [situation, impact, advanced, forecasts] = await Promise.all([
        getSituationOverview(),
        getImpactMetrics(),
        getAdvancedOverview(),
        generateRiskForecasts(),
      ])
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        situation,
        impact,
        advanced,
        forecasts: forecasts.slice(0, 10),
      })
    }

    switch (feature) {
      case 'situation':
        if (!roleAllows('advanced:read', user.role)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        return NextResponse.json(await getSituationOverview())

      case 'impact':
        if (!roleAllows('advanced:read', user.role)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        return NextResponse.json(await getImpactMetrics())

      case 'timeline': {
        const incidentId = url.searchParams.get('incidentId')
        if (!incidentId) {
          return NextResponse.json({ error: 'incidentId required' }, { status: 400 })
        }
        if (!roleAllows('advanced:read', user.role)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        const timeline = await getIncidentTimeline(incidentId)
        if (!timeline) {
          return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
        }
        return NextResponse.json(timeline)
      }

      case 'forecasts':
        if (!roleAllows('advanced:act', user.role)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        return NextResponse.json({ forecasts: await generateRiskForecasts() })

      default:
        return NextResponse.json({ error: `Unknown feature: ${feature}` }, { status: 400 })
    }
  } catch (e) {
    return handleAuthError(e)
  }
}
