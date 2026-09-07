// POST /api/citizen/sos/triage — AI SOS triage of a description (citizen only).
// Returns urgency severity + immediate guidance. DEMO fallback when AI is down.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { triageSos } from '@/lib/services/citizen-safety-service'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const body = await req.json().catch(() => ({}))
    const description = String(body.description || '').trim()
    if (description.length < 5) {
      return NextResponse.json({ error: 'Description is required (min 5 chars)' }, { status: 422 })
    }
    const language = typeof body.language === 'string' ? body.language.slice(0, 5).toLowerCase() : null
    const triage = await triageSos(description, language)
    return NextResponse.json({ triage })
  } catch (e) {
    return handleAuthError(e)
  }
}
