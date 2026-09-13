'use client'
// AI Missing Information card — shown on the citizen incident view and after submitting a report.
// Re-uses the existing incident; never creates duplicates.
import { useEffect, useState, useCallback, useRef } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Sparkles, Mic, MicOff, Send, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface MissingInfoQuestion {
  key: string
  question: string
  reason: string
}

interface MissingInfoResponse {
  available: boolean
  incidentId?: string
  incidentCode?: string
  type?: string
  alreadyKnown?: string[]
  questions?: MissingInfoQuestion[]
  summary?: string
}

const LANGUAGES = [
  { code: 'en', label: 'English', speechCode: 'en-IN' },
  { code: 'te', label: 'తెలుగు', speechCode: 'te-IN' },
  { code: 'hi', label: 'हिन्दी', speechCode: 'hi-IN' },
]

export function MissingInfoCard({ incidentId }: { incidentId: string }) {
  const [data, setData] = useState<MissingInfoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [language, setLanguage] = useState('en')
  const [listeningKey, setListeningKey] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiGet<MissingInfoResponse>(`/api/features/missing-info?incidentId=${incidentId}`)
      setData(r)
    } catch (e: any) {
      toast.error(e?.message || 'Could not load missing information')
    } finally {
      setLoading(false)
    }
  }, [incidentId])

  useEffect(() => { load() }, [load])

  // Voice input for any textarea
  const startVoice = (key: string) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      toast.error('Voice input not supported in this browser.')
      return
    }
    const recog = new SR()
    recog.lang = LANGUAGES.find((l) => l.code === language)?.speechCode || 'en-IN'
    recog.continuous = false
    recog.interimResults = false
    recognitionRef.current = recog
    setListeningKey(key)
    recog.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript
      if (text) setAnswers((prev) => ({ ...prev, [key]: prev[key] ? prev[key] + ' ' + text : text }))
    }
    recog.onerror = () => setListeningKey(null)
    recog.onend = () => {
      setListeningKey(null)
    }
    recog.start()
  }
  const stopVoice = () => {
    if (recognitionRef.current) recognitionRef.current.stop()
    setListeningKey(null)
  }

  const submitAnswers = async () => {
    setSubmitting(true)
    try {
      const cleanedAnswers: Record<string, string> = {}
      for (const q of data?.questions || []) {
        const v = (answers[q.key] || '').trim()
        if (v) cleanedAnswers[q.key] = v
      }
      if (Object.keys(cleanedAnswers).length === 0) {
        toast.error('Please answer at least one question before submitting.')
        setSubmitting(false)
        return
      }
      const res = await apiPost<{ recheck: MissingInfoResponse; appliedFields: string[] }>(`/api/features/missing-info`, {
        incidentId,
        answers: cleanedAnswers,
      })
      toast.success('Thank you! Your answers were saved to the same incident.', {
        description: `Added ${res.appliedFields.length} detail field(s).`,
      })
      setAnswers({})
      load()
    } catch (e: any) {
      toast.error(e?.message || 'Could not save answers')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Missing Information for Emergency Response
        </CardTitle>
        <CardDescription className="text-xs">
          These follow-up questions are specific to your incident type. Your answers are saved on the SAME incident — no duplicate report is created.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> AI is reviewing your report…
          </div>
        )}

        {!loading && data?.available === false && (
          <div className="text-xs text-muted-foreground italic">DATA UNAVAILABLE — could not review this incident.</div>
        )}

        {!loading && data?.available && (
          <>
            <div className="rounded-md border-sev-MEDIUM/40 bg-sev-MEDIUM/10 px-3 py-2 flex items-center justify-between">
              <span className="text-xs flex items-center gap-1.5 text-sev-MEDIUM">
                <AlertTriangle className="h-3.5 w-3.5" /> MISSING INFORMATION detected for <strong className="ml-1">{data.incidentCode} ({data.type})</strong>
              </span>
              <Badge variant="outline" className="text-[10px]">{data.questions?.length || 0} to answer</Badge>
            </div>

            {(data.alreadyKnown?.length ?? 0) > 0 && (
              <div className="rounded-md border-sev-LOW/40 bg-sev-LOW/5 p-2.5 text-xs space-y-1">
                <div className="font-semibold text-sev-LOW flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Information already captured
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {(data.alreadyKnown || []).map((k) => (
                    <span key={k} className="text-muted-foreground">• {k.replace(/_/g, ' ')}</span>
                  ))}
                </div>
              </div>
            )}

            {(data.questions?.length ?? 0) === 0 && (
              <div className="text-xs text-sev-LOW">✓ No additional information is required right now.</div>
            )}

            {(data.questions || []).map((q) => (
              <div key={q.key} className="rounded-md border-border p-2.5 space-y-1.5">
                <div className="text-sm font-medium">{q.question}</div>
                <div className="text-[10px] text-muted-foreground italic">{q.reason}</div>
                <div className="flex items-end gap-2">
                  <Textarea
                    rows={2}
                    placeholder="Type your answer, or use voice input"
                    value={answers[q.key] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant={listeningKey === q.key ? 'destructive' : 'outline'}
                    title={listeningKey === q.key ? 'Stop listening' : 'Voice input'}
                    onClick={() => listeningKey === q.key ? stopVoice() : startVoice(q.key)}
                  >
                    {listeningKey === q.key ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Voice language:</span>
              {LANGUAGES.map((l) => (
                <Button
                  type="button"
                  key={l.code}
                  size="sm"
                  variant={language === l.code ? 'default' : 'outline'}
                  onClick={() => setLanguage(l.code)}
                  className={cn('text-[11px]', language === l.code && 'bg-primary text-primary-foreground')}
                >
                  {l.label}
                </Button>
              ))}
            </div>

            {(data.questions?.length ?? 0) > 0 && (
              <Button onClick={submitAnswers} disabled={submitting} className="gap-2">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Save answers to my incident
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
