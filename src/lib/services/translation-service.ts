// GAME-CHANGER #2 — AI COMMUNICATION TRANSLATOR
// ------------------------------------------------------------------
// Multilingual emergency communication for English / Telugu / Hindi.
//
// DESIGN RULES (enforced here, not just documented):
//  * The ORIGINAL message is never overwritten. A translation is an additive
//    artifact stored in MessageTranslation and clearly labelled as AI output.
//  * If Gemini is unavailable we return source:'unavailable' and the UI shows
//    the original text only. We NEVER fabricate or guess a translation, and we
//    never silently fall back to a machine dictionary.
//  * Translations are cached per (messageId, targetLang) so repeat views are
//    free and consistent.
//
// The Gemini API key is read server-side only (via lib/ai-client) and is never
// returned to, or referenced by, any frontend code.

import { db } from '@/lib/db'
import { askAI, extractJson } from '@/lib/ai-client'
import { recordAudit } from '@/lib/events'

export type SupportedLang = 'en' | 'te' | 'hi'

export const SUPPORTED_LANGUAGES: { code: SupportedLang; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
]

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  te: 'Telugu',
  hi: 'Hindi',
}

export function isSupportedLang(v: unknown): v is SupportedLang {
  return v === 'en' || v === 'te' || v === 'hi'
}

export function langName(code: string): string {
  return LANG_NAMES[code] ?? code
}

export interface TranslationResult {
  translated: string
  sourceLang: string
  targetLang: string
  // 'ai' = produced by Gemini, 'unavailable' = AI unreachable (show original only)
  source: 'ai' | 'unavailable'
  confidence?: number
  detectedLang?: string
  error?: string
}

const SYSTEM_PROMPT = `You are a professional emergency-services translator working for a disaster response coordination platform.
You translate short operational messages between English, Telugu and Hindi.

Return STRICT JSON ONLY (no markdown, no prose):
{
  "translated": "<the translation>",
  "detected_source_language": "<ISO 639-1 code: en | te | hi>",
  "confidence": <0-1>
}

Rules:
- Preserve emergency meaning EXACTLY. Never add, remove, soften or invent information.
- Keep place names, numbers, units, incident codes (e.g. RF-2026-000001) and phone numbers unchanged.
- Use clear, plain language a citizen under stress can understand.
- If the message is already in the target language, return it unchanged.
- Never refuse. If a word is untranslatable, transliterate it rather than dropping it.
- Output must be valid JSON parseable by JSON.parse.`

/**
 * Translate arbitrary text via the backend AI client.
 * Never throws — returns source:'unavailable' with an error string on failure.
 */
export async function translateText(
  text: string,
  targetLang: SupportedLang,
  sourceLangHint?: string | null
): Promise<TranslationResult> {
  const clean = String(text ?? '').trim()
  if (!clean) {
    return { translated: '', sourceLang: sourceLangHint || 'en', targetLang, source: 'unavailable', error: 'Empty text' }
  }

  const hint = sourceLangHint && LANG_NAMES[sourceLangHint]
    ? `\nThe message is most likely in ${LANG_NAMES[sourceLangHint]} (${sourceLangHint}). Verify from the text itself.`
    : ''

  const userPrompt = `Target language: ${LANG_NAMES[targetLang]} (${targetLang})
Message to translate:
"""
${clean}
"""${hint}`

  const res = await askAI(SYSTEM_PROMPT, userPrompt)

  if (res.ok) {
    const parsed = extractJson<{ translated?: string; detected_source_language?: string; confidence?: number }>(res.content)
    const translated = typeof parsed?.translated === 'string' ? parsed.translated.trim() : ''
    if (translated) {
      return {
        translated,
        sourceLang: (parsed?.detected_source_language || sourceLangHint || 'en').toLowerCase().slice(0, 5),
        targetLang,
        source: 'ai',
        confidence:
          typeof parsed?.confidence === 'number' && Number.isFinite(parsed.confidence)
            ? Math.max(0, Math.min(1, parsed.confidence))
            : undefined,
        detectedLang: parsed?.detected_source_language?.toLowerCase().slice(0, 5),
      }
    }
    // AI responded but we could not parse a translation — do NOT invent one.
    return {
      translated: '',
      sourceLang: sourceLangHint || 'en',
      targetLang,
      source: 'unavailable',
      error: 'AI returned an unreadable translation response.',
    }
  }

  return {
    translated: '',
    sourceLang: sourceLangHint || 'en',
    targetLang,
    source: 'unavailable',
    error: res.error,
  }
}

/**
 * Translate a stored chat message, caching the result.
 * The caller is responsible for having already authorized access to the message.
 */
export async function translateChatMessage(params: {
  messageId: string
  targetLang: SupportedLang
  requestedById?: string
  // Set true to force a fresh AI call even if a cached translation exists.
  refresh?: boolean
}): Promise<TranslationResult & { cached: boolean; original: string }> {
  const { messageId, targetLang, requestedById, refresh } = params

  const message = await db.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, body: true, kind: true },
  })
  if (!message) {
    return { translated: '', sourceLang: 'en', targetLang, source: 'unavailable', cached: false, original: '', error: 'Message not found' }
  }

  // Only TEXT messages carry translatable bodies. Location/incident cards are
  // structured data — the UI renders those natively, so there is nothing to translate.
  const original = message.body ?? ''
  if (message.kind !== 'TEXT' || !original.trim()) {
    return { translated: '', sourceLang: 'en', targetLang, source: 'unavailable', cached: false, original, error: 'Message has no translatable text' }
  }

  if (!refresh) {
    const cachedRow = await db.messageTranslation.findUnique({
      where: { messageId_targetLang: { messageId, targetLang } },
    })
    if (cachedRow && cachedRow.source === 'ai' && cachedRow.translated) {
      return {
        translated: cachedRow.translated,
        sourceLang: cachedRow.sourceLang,
        targetLang,
        source: 'ai',
        confidence: cachedRow.confidence ?? undefined,
        cached: true,
        original,
      }
    }
  }

  const result = await translateText(original, targetLang)

  // Only persist successful AI translations. A failure is transient — caching it
  // would permanently show "unavailable" even after the AI recovers.
  if (result.source === 'ai' && result.translated) {
    try {
      await db.messageTranslation.upsert({
        where: { messageId_targetLang: { messageId, targetLang } },
        create: {
          messageId,
          sourceLang: result.sourceLang,
          targetLang,
          translated: result.translated,
          source: 'ai',
          confidence: result.confidence ?? null,
          requestedById: requestedById ?? null,
        },
        update: {
          sourceLang: result.sourceLang,
          translated: result.translated,
          source: 'ai',
          confidence: result.confidence ?? null,
          requestedById: requestedById ?? null,
        },
      })
      await recordAudit({
        userId: requestedById,
        action: 'MESSAGE_TRANSLATED',
        entityId: messageId,
        newState: `${result.sourceLang}->${targetLang}`,
        reason: 'AI emergency chat translation',
      })
    } catch (e) {
      // Caching failure must never fail the translation the user asked for.
      console.error('[translation] failed to cache translation:', e)
    }
  }

  return { ...result, cached: false, original }
}

/**
 * Batch-translate several messages in one AI round-trip.
 * Used by the priority queue so we do not issue one request per message
 * (performance requirement: avoid unnecessary API calls).
 */
// Collapse all whitespace runs to a single space before sending text to the AI.
const RE_WS = /\s+/g
export async function translateBatch(
  items: { id: string; text: string }[],
  targetLang: SupportedLang
): Promise<Record<string, TranslationResult>> {
  const out: Record<string, TranslationResult> = {}
  if (items.length === 0) return out

  // Reuse any cached translations first.
  const missing: { id: string; text: string }[] = []
  const cachedRows = await db.messageTranslation.findMany({
    where: { targetLang, messageId: { in: items.map((i) => i.id) } },
  })
  const cachedMap = new Map(cachedRows.map((r) => [r.messageId, r]))

  for (const item of items) {
    const cachedRow = cachedMap.get(item.id)
    if (cachedRow && cachedRow.source === 'ai' && cachedRow.translated) {
      out[item.id] = {
        translated: cachedRow.translated,
        sourceLang: cachedRow.sourceLang,
        targetLang,
        source: 'ai',
        confidence: cachedRow.confidence ?? undefined,
      }
    } else {
      missing.push(item)
    }
  }

  if (missing.length === 0) return out

  // Translate the remaining ones in a single strict-JSON call.
  const numbered = missing
    .map((m, i) => `[${i + 1}] ${String(m.text).replace(RE_WS, ' ').slice(0, 500)}`)
    .join('\n')
  const system = `You are a professional emergency-services translator (English, Telugu, Hindi).
Translate each numbered message into ${LANG_NAMES[targetLang]}.
Return STRICT JSON ONLY:
{ "translations": [ { "index": <1-based index>, "translated": "<text>" } ] }
Rules: preserve meaning exactly, keep place names/numbers/incident codes unchanged, never invent content.`
  const res = await askAI(system, `Messages:\n${numbered}`)

  if (res.ok) {
    const parsed = extractJson<{ translations?: { index?: number; translated?: string }[] }>(res.content)
    const list = Array.isArray(parsed?.translations) ? parsed.translations : []
    for (const row of list) {
      const idx = Number(row?.index)
      if (!Number.isInteger(idx) || idx < 1 || idx > missing.length) continue
      const target = missing[idx - 1]
      const translated = typeof row?.translated === 'string' ? row.translated.trim() : ''
      if (!target || !translated) continue
      out[target.id] = { translated, sourceLang: 'auto', targetLang, source: 'ai' }
    }
  }

  // Anything still unresolved is honestly marked unavailable.
  for (const item of missing) {
    if (!out[item.id]) {
      out[item.id] = {
        translated: '',
        sourceLang: 'auto',
        targetLang,
        source: 'unavailable',
        error: res.ok ? 'Message was not returned by the translator.' : res.error,
      }
    }
  }

  return out
}
