import { NextResponse } from 'next/server'
import { askAI } from '@/lib/ai-client'

const SYSTEM_PROMPT = `You are ResourceFlow AI, an emergency coordination and analysis assistant.
Analyze the user's request clearly and practically. You can summarize reports, identify severity signals, extract affected people and urgent needs, explain risk factors, suggest response priorities, interpret operational data, and answer general questions.
For incident reports, use this structure when useful: Situation, Key signals, Risks, Recommended next actions, Missing information.
Never invent facts, claim certainty about safety, diagnose medical conditions, or replace trained emergency services. If there may be immediate danger, advise contacting local emergency services first. Keep answers concise, actionable, and transparent about assumptions.`

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''

    if (!prompt) {
      return NextResponse.json({ error: 'Please enter something to analyze.' }, { status: 400 })
    }

    if (prompt.length > 4000) {
      return NextResponse.json({ error: 'Please keep your message under 4,000 characters.' }, { status: 400 })
    }

    const result = await askAI(SYSTEM_PROMPT, prompt)

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error.includes('network') ? result.error : 'Gemini AI is temporarily unavailable. Please try again shortly.' },
        { status: 503 }
      )
    }

    return NextResponse.json({ content: result.content })
  } catch (error) {
    console.error('AI chat request failed:', error)
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
}
