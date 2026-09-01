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

export async function askAI(systemPrompt: string, userPrompt: string): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  try {
    const zai = await getZai()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    })
    const content = completion.choices?.[0]?.message?.content
    if (!content || !content.trim()) {
      return { ok: false, error: 'Empty AI response' }
    }
    return { ok: true, content }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
}

// Extract a JSON object from a model response that may be wrapped in ```json fences.
export function extractJson(content: string): any | null {
  if (!content) return null
  let text = content.trim()
  // strip code fences
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  // find the first { ... last }
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
