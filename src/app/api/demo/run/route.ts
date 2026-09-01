import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'
import { runHackathonDemo } from '@/lib/services/demo-service'

// POST /api/demo/run — orchestrator runs the full end-to-end demo
export async function POST(_req: NextRequest) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const result = await runHackathonDemo(user.id)
    return ok(result, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}
