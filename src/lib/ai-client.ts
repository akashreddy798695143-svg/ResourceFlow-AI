// AI service — backend-only wrapper around z-ai-web-dev-sdk.
// Used by the incident agent + resource agent. Always has a deterministic fallback
// so the platform keeps working if the model is unavailable.

import ZAI from 'z-ai-web-dev-sdk'

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function askGemini(systemPrompt: string, userPrompt: string) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
      }),
    }
  )

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Gemini request failed (${response.status}): ${details.slice(0, 240)}`)
  }

  const data = await response.json()
  const content = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('')
    .trim()

  if (!content) throw new Error('Gemini returned an empty response')
  return content
}

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
    const geminiContent = await askGemini(systemPrompt, userPrompt)
    if (geminiContent) return { ok: true, content: geminiContent }

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