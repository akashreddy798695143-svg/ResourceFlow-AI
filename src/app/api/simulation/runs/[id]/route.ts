import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const run = await db.simulationRun.findUnique({
      where: { id },
      include: { events: { orderBy: { simTimeMin: 'asc' } } },
    })
    if (!run) return err('Simulation run not found', 404)
    return ok({
      run: {
        ...run,
        config: JSON.parse(run.config),
        metrics: run.metrics ? JSON.parse(run.metrics) : null,
        events: run.events.map((e) => ({ ...e, data: JSON.parse(e.data) })),
      },
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
