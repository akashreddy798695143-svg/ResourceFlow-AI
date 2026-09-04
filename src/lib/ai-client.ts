// AI service — backend-only wrapper around z-ai-web-dev-sdk.
// Used by the incident agent + resource agent. Always has a deterministic fallback
// so the platform keeps working if the model is unavailable.

import ZAI from 'z-ai-web-dev-sdk'

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZai() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

export async function askAI(
  systemPrompt: string,
  userPrompt: string
): Promise<
  { ok: true; content: string } | { ok: false; error: string }
> {
  try {
    const zai = await getZai()

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    })

    const content = completion.choices?.[0]?.message?.content

    if (!content || !content.trim()) {
      console.error('RESOURCEFLOW AI ERROR: Empty AI response')
      return { ok: false, error: 'Empty AI response' }
    }

    return {
      ok: true,
      content,
    }
  } catch (e: any) {
    const errorMessage = String(e?.message ?? e)

    console.error('RESOURCEFLOW AI ERROR:', errorMessage)

    return {
      ok: false,
      error: errorMessage,
    }
  }
}

// Extract a JSON object from a model response that may be wrapped in ```json fences.
export function extractJson(content: string): any | null {
  if (!content) return null

  let text = content.trim()

  // Strip code fences
  if (text.startsWith('```')) {
    text = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
  }

  // Find the first { and last }
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')

  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1)
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}