'use client'
// GAME-CHANGER #2 — AI COMMUNICATION TRANSLATOR (chat UI)
//
// Lets a user view any emergency-chat message in English / Telugu / Hindi while
// the ORIGINAL text always remains visible and clearly marked. A translation is
// additive: it never replaces what the sender wrote.
//
// When the backend cannot reach the AI it says so ("Translation unavailable")
// and shows the original only — we never invent a translation.

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Languages, Loader2, Sparkles, AlertTriangle, Eye, EyeOff } from 'lucide-react'

interface LanguageOption {
  code: string
  label: string
  native: string
}

interface TranslationResponse {
  messageId: string
  original: string
  translated: string
  sourceLang: string
  targetLang: string
  source: 'ai' | 'unavailable'
  cached: boolean
  confidence: number | null
  label: string
  error: string | null
}

/**
 * Inline translation control rendered beneath a chat message bubble.
 * Only TEXT messages should mount this (structured cards need no translation).
 */
export function MessageTranslationControl({
  messageId,
  originalText,
  preferredLang,
  className,
}: {
  messageId: string
  originalText: string
  preferredLang?: string
  className?: string
}) {
  const [languages, setLanguages] = useState<LanguageOption[]>([])
  const [targetLang, setTargetLang] = useState<string>(preferredLang ?? 'en')
  const [result, setResult] = useState<TranslationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The original is ALWAYS shown; this only toggles whether the translation is.
  const [showTranslation, setShowTranslation] = useState(true)

  useEffect(() => {
    apiGet<{ languages: LanguageOption[] }>('/api/features?feature=languages')
      .then((r) => setLanguages(r.languages))
      .catch(() => setLanguages([
        { code: 'en', label: 'English', native: 'English' },
        { code: 'te', label: 'Telugu', native: 'తెలుగు' },
        { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
      ]))
  }, [])

  const translate = useCallback(async (lang: string, refresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiPost<TranslationResponse>('/api/features', {
        action: 'translate',
        messageId,
        targetLang: lang,
        refresh,
      })
      setResult(res)
      setShowTranslation(true)
      if (res.source === 'unavailable') {
        setError(res.error || 'The AI translator is currently unavailable.')
      }
    } catch (e: any) {
      setError(e?.message || 'Translation failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [messageId])

  // Auto-translate once when a preferred language is supplied and differs from
  // the message language — this is what makes a Telugu speaker's message arrive
  // already readable for an English-speaking officer.
  useEffect(() => {
    if (preferredLang && preferredLang !== 'en') {
      translate(preferredLang)
    }
  }, [preferredLang, translate])

  const languagesToShow = languages.length
    ? languages
    : [
      { code: 'en', label: 'English', native: 'English' },
      { code: 'te', label: 'Telugu', native: 'తెలుగు' },
      { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
    ]

  return (
    <div className={cn('mt-1.5 space-y-1.5', className)}>
      {/* Language picker */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Languages className="h-3 w-3 text-muted-foreground shrink-0" />
        {languagesToShow.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => {
              setTargetLang(l.code)
              translate(l.code)
            }}
            disabled={loading}
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50',
              targetLang === l.code && result
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
            title={`Translate to ${l.label}`}
          >
            {l.native}
          </button>
        ))}
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {result?.source === 'ai' && !loading && (
          <>
            <Badge variant="outline" className="text-[9px] font-mono gap-1 border-primary/40 text-primary">
              <Sparkles className="h-2.5 w-2.5" /> AI TRANSLATION
            </Badge>
            <button
              type="button"
              onClick={() => setShowTranslation((v) => !v)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {showTranslation ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
              {showTranslation ? 'Show original only' : 'Show translation'}
            </button>
          </>
        )}
      </div>

      {/* Original — always visible, never overwritten */}
      <div className="rounded-md border-border bg-background/40 px-2 py-1.5">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground mb-0.5">
          Original{result?.sourceLang ? ` (${result.sourceLang})` : ''}
        </p>
        <p className="text-xs leading-snug whitespace-pre-line">{originalText}</p>
      </div>

      {/* Translation — additive, clearly labelled */}
      {result?.source === 'ai' && result.translated && showTranslation && (
        <div className="rounded-md border-primary/30 bg-primary/5 px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-primary mb-0.5 flex items-center gap-1">
            <Sparkles className="h-2.5 w-2.5" />
            AI translation ({result.targetLang})
            {result.cached && <span className="text-muted-foreground normal-case">· cached</span>}
          </p>
          <p className="text-xs leading-snug whitespace-pre-line">{result.translated}</p>
        </div>
      )}

      {/* Honest failure — original only */}
      {error && (
        <p className="text-[10px] text-amber-400 flex items-start gap-1">
          <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0" />
          <span>Translation unavailable — showing the original message only. ({error})</span>
        </p>
      )}
    </div>
  )
}
