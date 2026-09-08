import { NextRequest, NextResponse } from 'next/server'
import { askAI } from '@/lib/ai-client'
import { db } from '@/lib/db'

/**
 * Gather a concise, operational-only snapshot of live ResourceFlow AI data
 * so the assistant can answer contextually instead of inventing facts.
 * Deliberately EXCLUDES citizen PII (names, phones, emails).
 * Never throws — if the DB is unavailable we just say so.
 */
async function buildContextText(): Promise<{
  text: string
  available: boolean
}> {
  try {
    const [activeIncidents, resourceCounts, approvals] = await Promise.all([
      db.incident.findMany({
        where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          incidentCode: true,
          type: true,
          status: true,
          location: true,
          riskLevel: true,
          riskScore: true,
          aiSeverity: true,
          aiPeopleAffected: true,
          aiRoadBlocked: true,
        },
      }),
      db.resource.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      db.approval.count({ where: { decision: 'PENDING' } }),
    ])

    const totalResources = resourceCounts.reduce((sum, r) => sum + r._count._all, 0)
    const resourceSummary = resourceCounts
      .map((r) => `${r.status}: ${r._count._all}`)
      .join(', ')

    const incidentLines =
      activeIncidents.length === 0
        ? 'No active incidents on record right now.'
        : activeIncidents
            .map(
              (inc) =>
                `- ${inc.incidentCode} | type=${inc.type} | status=${inc.status} | location=${inc.location} | reference risk level=${inc.riskLevel ?? 'n/a'} | riskScore=${inc.riskScore ?? 'n/a'} | aiSeverity=${inc.aiSeverity ?? 'n/a'} | peopleAffected~${inc.aiPeopleAffected ?? 'n/a'} | roadBlocked=${inc.aiRoadBlocked === true}`
            )
            .join('\n')

    return {
      available: true,
      text: `
ACTIVE INCIDENTS (${activeIncidents.length}):
${incidentLines}

RESOURCES (${totalResources} total):
${resourceSummary}${resourceSummary ? '' : ' (none on record)'}

PENDING APPROVALS: ${approvals}
`,
    }
  } catch (e) {
    console.error('[ai/chat] failed to build context (non-fatal):', e)
    return {
      available: false,
      text: 'Live application data is currently unavailable.',
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const userPrompt = body?.prompt

    if (
      !userPrompt ||
      typeof userPrompt !== 'string' ||
      !userPrompt.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Prompt is required',
        },
        { status: 400 }
      )
    }

    const { text: contextText } = await buildContextText()

    // Debug logging — no API keys, passwords, or citizen PII.
    console.log(`[ai/chat] incoming prompt (${userPrompt.trim().length} chars): "${userPrompt.trim().slice(0, 120)}"`)

    const systemPrompt = `
You are ResourceFlow AI, an AI-powered disaster management and
emergency coordination assistant for the ResourceFlow AI platform.

LIVE APPLICATION CONTEXT (use this instead of inventing data):
${contextText}

When a user asks about the current situation or available resources,
base your answer on the LIVE APPLICATION CONTEXT above.
If the context says data is unavailable or a field is "n/a", say so
clearly rather than guessing.

Help analyze:
- Floods
- Earthquakes
- Cyclones
- Landslides
- Heavy rainfall
- Extreme weather
- Fire
- Other disaster incidents

Provide:
- Risk assessment
- Severity
- Priority
- Possible impact
- Resource requirements
- Recommended actions
- Safety recommendations

IMPORTANT:
This is decision-support software.
Do not claim that you can guarantee or exactly predict future disasters.
Clearly distinguish:
- Current information (from the LIVE APPLICATION CONTEXT)
- Risk assessment
- Forecasts
- Estimates
- Recommendations
Do not invent real-time information or live values that are not in context.
Do not include confirmed operational information that is not in context.

For earthquake-related questions, use:
"AI-assisted seismic risk assessment and early-warning decision support."
For flood-related questions, use:
"AI-assisted flood risk assessment and forecasting."

AI recommendations are decision-support information and do not replace
authorized emergency personnel. For urgent life-threatening emergencies,
recommend contacting local emergency services.
`

    console.log('[ai/chat] AI request started')
    const result = await askAI(systemPrompt, userPrompt.trim())
    console.log(`[ai/chat] AI returned ok=${result.ok}`)

    if (!result.ok || !result.content.trim()) {
      const message = result.ok
        ? 'Gemini returned an empty response. Please try again.'
        : result.error
      console.log(`[ai/chat] responding success=false: "${String(message).slice(0, 120)}"`)
      return NextResponse.json(
        {
          success: false,
          error: message,
        },
        { status: 503 }
      )
    }

    console.log(`[ai/chat] extracted response text (${result.content.trim().length} chars)`)
    return NextResponse.json({
      success: true,
      response: result.content.trim(),
    })
  } catch (error: any) {
    console.error(
      'AI chat request failed:',
      error?.message || error
    )

    const message =
      error?.message ||
      'Gemini AI is temporarily unavailable.'

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 503 }
    )
  }
}