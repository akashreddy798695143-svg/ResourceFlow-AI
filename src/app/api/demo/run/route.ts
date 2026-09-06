import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'
import { runHackathonDemo } from '@/lib/services/demo-service'

// POST /api/demo/run — orchestrator runs the full end-to-end demo
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    let scenario: any = 'EARTHQUAKE'
    try {
      const body = await req.json()
      if (body?.scenario) scenario = body.scenario
    } catch {}
    const result = await runHackathonDemo(user.id, scenario)
    return ok(result, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}
