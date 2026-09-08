import { GoogleGenAI } from '@google/genai'

/**
 * Single, consistent result type for every AI call in the project.
 *   - ok:true  -> content holds the generated text
 *   - ok:false -> error holds a clean, user-safe message
 * All callers MUST branch on `result.ok` and read `result.content` only
 * inside the `ok` branch. Never mix this with a raw-string-returning API.
 */
export type AIResult =
  | { ok: true; content: string }
  | { ok: false; error: string }

// Keep the model configurable so deployments can switch without a code
// change. The fallback matches the model supported by this project's Gemini
// key/account (confirmed via the live API: gemini-3.6-flash).
const DEFAULT_MODEL = 'gemini-3.6-flash'

// Bounded retries with exponential backoff — never an infinite loop.
const MAX_RETRIES = 2
const BACKOFF_BASE_MS = 1000

let ai: GoogleGenAI | null = null

function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  if (!ai) {
    ai = new GoogleGenAI({ apiKey })
  }
  return ai
}

/**
 * Extract JSON from an AI response.
 * Handles pure JSON, ```json blocks, JSON surrounded by prose, objects and arrays.
 * Never throws. Returns null when no valid JSON can be recovered.
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text || typeof text !== 'string') return null

  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    // try further extraction
  }

  const objectStart = cleaned.indexOf('{')
  const objectEnd = cleaned.lastIndexOf('}')
  if (objectStart !== -1 && objectEnd > objectStart) {
    try {
      return JSON.parse(cleaned.slice(objectStart, objectEnd + 1)) as T
    } catch {
      // try array extraction
    }
  }

  const arrayStart = cleaned.indexOf('[')
  const arrayEnd = cleaned.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1)) as T
    } catch {
      // give up
    }
  }

  return null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface GeminiErrorLike {
  status?: number
  code?: string
  message?: string
  error?: { status?: number; message?: string }
  response?: { status?: number }
}

function toGeminiErrorLike(error: unknown) {
  if (error && typeof error === 'object') {
    const e = error as GeminiErrorLike
    const message = e.message || (e.error && e.error.message) || 'Unknown Gemini error'
    const status = e.status || (e.error && e.error.status) || e.response?.status
    return { status, message }
  }
  return { status: undefined, message: String(error) }
}

/**
 * Decide whether a failure is worth retrying.
 * Permanent errors (bad request, auth, model/API missing… ) return false so we
 * surface a clean error immediately. Temporary errors (rate limit, server
 * overload, network, timeout) return true so the caller retries with backoff.
 */
function isRetryable(status: number | undefined, message: string): boolean {
  const m = message.toLowerCase()
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('rate limit') ||
    m.includes('too many requests') ||
    m.includes('overloaded') ||
    m.includes('temporarily unavailable') ||
    m.includes('service unavailable') ||
    m.includes('deadline exceeded') ||
    m.includes('connection reset') ||
    /network|fetch|unreachable|econnrefused|socket/i.test(m)
  )
}
/**
 * Call Gemini safely.
 * Returns a result object — it NEVER throws. When the API key is missing,
 * when a permanent error occurs, or when all retries are exhausted, it
 * returns `{ ok: false, error }` so callers can fall back gracefully.
 */
export async function askAI(
  systemPrompt: string,
  userPrompt: string
): Promise<AIResult> {
  const client = getAI()

  if (!client) {
    return {
      ok: false,
      error:
        'AI is not configured. Add GEMINI_API_KEY to your server environment.',
    }
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL
  const contents = `${systemPrompt}\n\nUSER REQUEST:\n${userPrompt}`
  let maxOutputTokens = 2048
  try {
    const parsed = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS)
    if (parsed && Number.isFinite(parsed)) maxOutputTokens = parsed
  } catch {
    // keep default
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          temperature: 0.2,
          maxOutputTokens,
        },
      })

      const text = response.text

      if (!text || !text.trim()) {
        if (attempt === MAX_RETRIES) {
          return { ok: false, error: 'Gemini returned an empty response.' }
        }
        await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt))
        continue
      }

      return { ok: true, content: text.trim() }
    } catch (error) {
      const { status, message } = toGeminiErrorLike(error)

      // Log useful server-side debugging info, but never the API key.
      console.error(
        `[ai] Gemini request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
        { status, message }
      )

      if (!isRetryable(status, message)) {
        // Permanent error (400 / 401 / 403 / 404 / 409…) — no point retrying.
        return { ok: false, error: formatAIClientError(message) }
      }

      if (attempt === MAX_RETRIES) {
        return {
          ok: false,
          error: 'AI is temporarily unavailable. Please try again shortly.',
        }
      }

      await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt))
    }
  }

  return {
    ok: false,
    error: 'AI is temporarily unavailable. Please try again shortly.',
  }
}
/**
 * Produce a clean, non-technical error message for end users while still
 * surfacing the underlying reason server-side.
 */
function formatAIClientError(raw: string): string {
  const lower = raw.toLowerCase()
  if (
    lower.includes('api key') ||
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('403')
  ) {
    return 'AI service authentication failed. Please check the server configuration.'
  }
  if (lower.includes('not configured')) {
    return 'AI service is not configured on the server.'
  }
  if (
    lower.includes('not found') ||
    lower.includes('does not exist') ||
    lower.includes('404') ||
    lower.includes('model')
  ) {
    return 'AI model is not available on the server. Please verify the model configuration.'
  }
  if (lower.includes('quota') || lower.includes('billing')) {
    return 'AI service quota exceeded. Please try again later.'
  }
  return 'AI is temporarily unavailable. Please try again shortly.'
}

/**
 * Optional helper for structured AI responses.
 * Throws only when the underlying call fails or returns invalid JSON — callers
 * that want graceful degradation should use `askAI` directly.
 */
export async function askAIJson<T = unknown>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const result = await askAI(
    `${systemPrompt}\n\nIMPORTANT:\nReturn ONLY valid JSON.\nDo not use markdown.\nDo not add explanations outside the JSON.`,
    userPrompt
  )

  if (!result.ok) {
    throw new Error(result.error)
  }

  const parsed = extractJson<T>(result.content)

  if (!parsed) {
    throw new Error('AI returned an invalid JSON response')
  }

  return parsed
}
