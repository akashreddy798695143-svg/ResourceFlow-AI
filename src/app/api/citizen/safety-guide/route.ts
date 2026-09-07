// POST /api/citizen/safety-guide — AI Safety Guide (disaster-specific steps).
// Any authenticated role may use it; guidance is generic life-safety only.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { safetyGuide } from '@/lib/services/citizen-safety-service'

export async function POST(req: NextRequest) {
  try {
    await requireAuth() // any authenticated user; no internal data is exposed
    const body = await req.json().catch(() => ({}))
    const disasterType = String(body.disasterType || 'DEFAULT').slice(0, 60)
    const context = typeof body.context === 'string' ? body.context.slice(0, 500) : null
    const language = typeof body.language === 'string' ? body.language.slice(0, 5).toLowerCase() : null
    const guide = await safetyGuide(disasterType, context, language)
    return NextResponse.json(guide)
  } catch (e) {
    return handleAuthError(e)
  }
}
