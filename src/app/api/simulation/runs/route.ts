import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { runSimulation } from '@/lib/services/simulation-service'

// POST /api/simulation/runs — start a new simulation
export async function POST(req: NextRequest) {
  try {
    await requireAuth(['DISASTER_OFFICER', 'ADMIN', 'CITIZEN'])
    const body = parseBody(await req.json())
    const scenario = String(body.scenario || 'FLOOD').toUpperCase()
    if (!['FLOOD', 'CYCLONE', 'EARTHQUAKE', 'LANDSLIDE'].includes(scenario)) {
      return err('Invalid scenario', 422)
    }
    const options = body.options || {}
    const run = await runSimulation({
      scenario: scenario as any,
      options: {
        ambulanceUnavailable: Boolean(options.ambulanceUnavailable),
        rescueTeamUnavailable: Boolean(options.rescueTeamUnavailable),
        hospitalCapacityReduced: Boolean(options.hospitalCapacityReduced),
        shelterCapacityReduced: Boolean(options.shelterCapacityReduced),
        roadBlocked: Boolean(options.roadBlocked),
        responseDelay: Boolean(options.responseDelay),
        additionalIncidents: Boolean(options.additionalIncidents),
      },
    })
    return ok({ run }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}

// GET /api/simulation/runs — list runs
export async function GET() {
  try {
    await requireAuth()
    const runs = await db.simulationRun.findMany({ orderBy: { createdAt: 'desc' }, take: 30, include: { events: { orderBy: { simTimeMin: 'asc' } } } })
    return ok({ runs })
  } catch (e) {
    return handleAuthError(e)
  }
}
