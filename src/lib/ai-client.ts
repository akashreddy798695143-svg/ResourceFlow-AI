// src/lib/ai-client.ts

import { GoogleGenAI } from '@google/genai'

let ai: GoogleGenAI | null = null

function getAI() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  if (!ai) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    })
  }

  return ai
}

export async function askAI(
  systemPrompt: string,
  userPrompt: string
): Promise<
  { ok: true; content: string } |
  { ok: false; error: string }
> {
  try {
    const client = getAI()

    const response = await client.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
        maxOutputTokens: 1500,
      },
    })

    const content = response.text

    if (!content || !content.trim()) {
      return {
        ok: false,
        error: 'Empty Gemini response',
      }
    }

    return {
      ok: true,
      content: content.trim(),
    }
  } catch (error) {
    console.error('Gemini API error:', error)

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    }
  }
}

// Extract JSON from Gemini response
export function extractJson(content: string): any | null {
  if (!content) return null

  let text = content.trim()

  if (text.startsWith('```')) {
    text = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
  }

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