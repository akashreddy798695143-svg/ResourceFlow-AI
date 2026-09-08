import { NextRequest, NextResponse } from 'next/server'
import {
  requireAuth,
  handleAuthError,
} from '@/lib/auth'
import { db } from '@/lib/db'
import { askAI } from '@/lib/ai-client'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth([
      'DISASTER_OFFICER',
      'ADMIN',
    ])

    const [incidents, resources] =
      await Promise.all([
        db.incident.findMany({
          orderBy: {
            createdAt: 'desc',
          },
          take: 100,
          select: {
            type: true,
            status: true,
            riskLevel: true,
            riskScore: true,
            createdAt: true,
            aiPeopleAffected: true,
          },
        }),

        db.resource.findMany({
          select: {
            type: true,
            status: true,
            eta: true,
            capacity: true,
          },
        }),
      ])

    const prompt = `
Create a concise disaster operations situation summary.

Include:

1. Current Situation
2. Priority Risks
3. Resource Pressure
4. Next 24 Hours Risk Projection
5. Three Recommended Actions

Rules:
- Use only the supplied data.
- Do not invent facts.
- Clearly label projections as estimates.
- If there is insufficient data, say "Insufficient data".
- Do not claim exact disaster prediction.
- AI output is decision support only.
- Keep the response concise.

INCIDENT DATA:
${JSON.stringify(incidents, null, 2)}

RESOURCE DATA:
${JSON.stringify(resources, null, 2)}
`

    let summary =
      'AI summary is temporarily unavailable.'

    let source: 'ai' | 'fallback' = 'fallback'

    try {
      const result = await askAI(
        `
You are ResourceFlow AI,
an emergency operations analyst.

Analyze disaster incidents and
available emergency resources.

Be:
- factual
- concise
- transparent about uncertainty

Do not claim guaranteed prediction
of future disasters.

AI recommendations must be treated
as decision-support information.
        `,
        prompt
      )

      if (result.ok && result.content.trim()) {
        summary = result.content.trim()
        source = 'ai'
      }
    } catch (aiError) {
      console.error(
        'AI analytics summary failed:',
        aiError
      )

      summary =
        'AI analysis is temporarily unavailable. Please review the live incident and resource dashboard.'

      source = 'fallback'
    }

    return NextResponse.json({
      success: true,
      summary,
      source,
      generatedAt:
        new Date().toISOString(),
      incidentCount: incidents.length,
      resourceCount: resources.length,
    })
  } catch (error) {
    console.error(
      'Analytics summary API error:',
      error
    )

    return handleAuthError(error)
  }
}