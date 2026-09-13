// GET /api/features/conflicts — AI Resource Conflict Detector.
// Available to ADMIN and DISASTER_OFFICER for the operational dashboard,
// and RESPONDER for a read-only summary of conflicts involving their assignments.
// Uses REAL DB data only — never fabricates.
import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'
import { detectResourceConflicts } from '@/lib/features/conflict-detector'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth(['DISASTER_OFFICER', 'ADMIN', 'RESPONDER'])
    const result = await detectResourceConflicts()
    return ok(result)
  } catch (e) {
    return handleAuthError(e)
  }
}
