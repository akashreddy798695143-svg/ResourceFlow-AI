import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'
import { db } from '@/lib/db'
import { askAI } from '@/lib/ai-client'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const [incidents, resources] = await Promise.all([
      db.incident.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { type: true, status: true, riskLevel: true, riskScore: true, createdAt: true, aiPeopleAffected: true } }),
      db.resource.findMany({ select: { type: true, status: true, eta: true, capacity: true } }),
    ])
    const prompt = `Create a concise disaster operations situation summary from this JSON. Include: current situation, priority risks, resource pressure, trend/prediction for the next 24 hours, and three recommended actions. Clearly label projections as estimates and do not invent facts.\n${JSON.stringify({ incidents, resources })}`
    const result = await askAI('You are a careful emergency operations analyst. Be factual, concise, and transparent about uncertainty.', prompt)
    return ok({ summary: result.ok ? result.content : 'AI summary is temporarily unavailable.', source: result.ok ? 'ai' : 'fallback' })
  } catch (e) {
    return handleAuthError(e)
  }
}
