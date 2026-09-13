'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Bot, Loader2, Send, Sparkles, X, Minus, RotateCcw,
  RadioTower, AlertTriangle, Mic, MicOff, ChevronRight,
  ShieldAlert, Activity, CheckCircle2,
} from 'lucide-react'
import { apiPost, ApiError } from '@/lib/api-client'
import { useRouter } from '@/lib/use-router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Message = {
  id: string
  role: 'assistant' | 'user'
  content: string
  timestamp: string
  actionType?: 'incident' | 'resource' | 'general'
}

type ChatResponse = {
  success: boolean
  response?: string
  error?: string
}

const STARTER_MESSAGE =
  "Hello! I'm ResourceFlow AI Emergency Response Assistant.\nI can analyze active incidents, assess disaster risks, optimize resource allocations, and provide situational guidance."

const FALLBACK_RESPONSE = 'Unable to generate an AI response right now. Please verify system connection and try again.'
const NETWORK_ERROR_MESSAGE = 'AI service connection failed. Please ensure the server is running and try again.'

const SUGGESTIONS = [
  { label: 'Analyze Active Incidents', prompt: 'Summarize all active emergency incidents and priority levels.' },
  { label: 'Check Resources', prompt: 'What is the current status of all emergency resources and response teams?' },
  { label: 'Resource Conflicts', prompt: 'Are there any resource conflicts or double-assigned units?' },
  { label: 'Seismic & Flood Risk', prompt: 'What are the current flood, seismic, and cascade disaster risks?' },
  { label: 'Find Nearby Help', prompt: 'How can citizens find nearest safe shelters, hospitals, and emergency services?' },
  { label: 'Safety Guidelines', prompt: 'What are the key emergency protocols for flood and earthquake evacuation?' },
]

export function AIAssistant() {
  const { path, navigate, params } = useRouter()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState('AI is analyzing...')
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const recognitionRef = useRef<any>(null)

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content: STARTER_MESSAGE,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Web Speech API detection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      setVoiceSupported(!!SR)
    }
  }, [])

  // Auto scroll to newest message
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [])

  useEffect(() => {
    if (open) {
      scrollToBottom()
      // Focus input when opened on desktop
      if (window.innerWidth > 640) {
        setTimeout(() => inputRef.current?.focus(), 150)
      }
    }
  }, [open, messages, loading, scrollToBottom])

  // Context awareness: determine if user is viewing specific incident or area
  const getContextLabel = () => {
    if (path.startsWith('/incidents/') && params.id) {
      return `Incident #${params.id.slice(-6).toUpperCase()}`
    }
    if (path === '/command-center') return 'Command Center View'
    if (path === '/resources') return 'Resource Management'
    if (path === '/safety-center') return 'Citizen Safety Center'
    if (path === '/simulation') return 'Disaster Simulation'
    if (path === '/volunteer-management' || path === '/volunteer-map') return 'Volunteer Logistics'
    return null
  }
  const currentContext = getContextLabel()

  const startVoiceInput = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.lang = 'en-IN'
    recognition.continuous = false
    recognition.interimResults = false
    recognitionRef.current = recognition
    setListening(true)

    recognition.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript
      if (text) {
        setPrompt((prev) => (prev ? `${prev} ${text}` : text))
      }
    }

    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognition.start()
  }

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setListening(false)
  }

  const handleSend = async (customPrompt?: string) => {
    const value = (customPrompt || prompt).trim()
    if (!value || loading) return

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: value,
      timestamp: now,
    }

    setPrompt('')
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    // Contextual loading label based on prompt content
    const lower = value.toLowerCase()
    if (lower.includes('incident') || lower.includes('report')) {
      setLoadingStatus('Analyzing incident telemetry...')
    } else if (lower.includes('resource') || lower.includes('ambulance') || lower.includes('team')) {
      setLoadingStatus('Evaluating resource deployment & conflicts...')
    } else if (lower.includes('help') || lower.includes('shelter') || lower.includes('hospital')) {
      setLoadingStatus('Searching emergency facilities & safe zones...')
    } else if (lower.includes('risk') || lower.includes('flood') || lower.includes('earthquake')) {
      setLoadingStatus('Calculating hazard risk scores...')
    } else {
      setLoadingStatus('ResourceFlow AI is thinking...')
    }

    try {
      const result = await apiPost<ChatResponse>('/api/ai/chat', { prompt: value })
      const content = result?.response?.trim()
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

      if (result?.success && content) {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content, timestamp: time },
        ])
      } else if (result?.success) {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content: FALLBACK_RESPONSE, timestamp: time },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content: result?.error?.trim() || FALLBACK_RESPONSE, timestamp: time },
        ])
      }
    } catch (error: unknown) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      if (error instanceof ApiError) {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content: error.message || FALLBACK_RESPONSE, timestamp: time },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content: NETWORK_ERROR_MESSAGE, timestamp: time },
        ])
      }
    } finally {
      setLoading(false)
    }
  }

  const resetChat = () => {
    setMessages([
      {
        id: `init-${Date.now()}`,
        role: 'assistant',
        content: STARTER_MESSAGE,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ])
  }

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 pointer-events-none">
      {/* Floating Action Launcher when chat is closed */}
      {!open && (
        <div className="pointer-events-auto">
          <button
            onClick={() => setOpen(true)}
            className="group flex items-center gap-2.5 p-3 sm:px-4 sm:py-3 rounded-full bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 font-semibold text-xs sm:text-sm shadow-xl shadow-black/25 dark:shadow-amber-500/20 hover:scale-105 active:scale-95 transition-all duration-200 border border-slate-700 dark:border-amber-400/50"
            aria-label="Open ResourceFlow AI Assistant"
            title="ResourceFlow AI Assistant"
          >
            <div className="relative flex items-center justify-center">
              <Sparkles className="h-4 w-4 animate-pulse text-amber-400 dark:text-slate-950" />
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <span className="hidden sm:inline tracking-wide">ResourceFlow AI</span>
            <Badge
              variant="secondary"
              className="hidden sm:inline-flex bg-slate-800 text-amber-400 dark:bg-slate-950/20 dark:text-slate-950 text-[10px] px-1.5 py-0 font-mono"
            >
              AI
            </Badge>
          </button>
        </div>
      )}

      {/* Floating Chatbot Window */}
      {open && (
        <div
          className="pointer-events-auto w-[calc(100vw-28px)] sm:w-[410px] h-[580px] max-h-[85vh] flex flex-col bg-card text-card-foreground border border-border shadow-2xl shadow-black/30 dark:shadow-black/70 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
          role="dialog"
          aria-label="ResourceFlow AI Assistant"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-muted/40 backdrop-blur shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <RadioTower className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="text-sm font-bold tracking-tight">RESOURCEFLOW AI</span>
                  <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 text-primary border-primary/40">
                    COPILOT
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-muted-foreground font-mono">
                    AI Online · Decision Support
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={resetChat}
                title="Reset conversation"
                aria-label="Reset conversation"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
                title="Minimize assistant"
                aria-label="Minimize assistant"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
                title="Close assistant"
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Active Context Banner if viewing specific route */}
          {currentContext && (
            <div className="px-3.5 py-1.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between text-[11px] font-mono shrink-0">
              <span className="flex items-center gap-1.5 text-primary font-medium truncate">
                <Activity className="h-3 w-3 shrink-0 animate-pulse" />
                Context: {currentContext}
              </span>
              <span className="text-[10px] text-muted-foreground">Auto-linked</span>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 rf-scroll bg-background/50">
            {messages.map((message) => {
              const isUser = message.role === 'user'
              return (
                <div
                  key={message.id}
                  className={cn(
                    'flex flex-col',
                    isUser ? 'items-end' : 'items-start'
                  )}
                >
                  <div className="flex items-start gap-2 max-w-[90%]">
                    {!isUser && (
                      <div className="flex h-6 w-6 rounded-md bg-primary/15 text-primary items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div
                      className={cn(
                        'rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs',
                        isUser
                          ? 'bg-primary text-primary-foreground rounded-tr-xs ml-auto'
                          : 'bg-card border border-border text-card-foreground rounded-tl-xs'
                      )}
                    >
                      <p className="whitespace-pre-line">{message.content}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono mt-1 px-1">
                    {message.timestamp}
                  </span>
                </div>
              )
            })}

            {/* Quick Action Suggestion Chips (visible after starter message) */}
            {messages.length === 1 && !loading && (
              <div className="pt-2 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Suggested Queries
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => handleSend(item.prompt)}
                      className="text-[11px] text-left px-2.5 py-1.5 rounded-lg border border-border/70 bg-card hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all flex items-center gap-1.5 text-muted-foreground font-medium"
                    >
                      <span>{item.label}</span>
                      <ChevronRight className="h-3 w-3 opacity-60" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* AI Loading indicator */}
            {loading && (
              <div className="flex items-start gap-2 max-w-[90%]">
                <div className="flex h-6 w-6 rounded-md bg-primary/15 text-primary items-center justify-center shrink-0 mt-0.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </div>
                <div className="rounded-2xl rounded-tl-xs px-3.5 py-2.5 bg-card border border-border text-card-foreground text-xs shadow-xs space-y-1.5">
                  <div className="flex items-center gap-2 text-muted-foreground font-mono">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <span>{loadingStatus}</span>
                  </div>
                  <div className="flex gap-1 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Emergency SOS Shortcut Banner */}
          <div className="px-3.5 py-2 bg-red-500/10 border-t border-red-500/20 flex items-center justify-between text-xs shrink-0">
            <span className="text-[11px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Need immediate life-safety rescue?
            </span>
            <button
              onClick={() => {
                setOpen(false)
                navigate('/report-incident')
              }}
              className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white shadow-xs transition-colors shrink-0"
            >
              Report Emergency
            </button>
          </div>

          {/* Fixed Input Composer */}
          <div className="p-3 border-t border-border bg-card shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSend()
              }}
              className="flex items-end gap-2"
            >
              <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Ask about incidents, resources, risk or emergency..."
                  rows={2}
                  maxLength={3000}
                  className="w-full resize-none rounded-xl border border-input bg-background/80 px-3 py-2 text-xs sm:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all disabled:opacity-50"
                  aria-label="Ask ResourceFlow AI Assistant"
                />

                {/* Voice speech recognition button */}
                {voiceSupported && (
                  <button
                    type="button"
                    onClick={listening ? stopVoiceInput : startVoiceInput}
                    className={cn(
                      'absolute right-2 bottom-2 p-1 rounded-md transition-colors',
                      listening
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                    title={listening ? 'Stop listening' : 'Voice input'}
                    aria-label={listening ? 'Stop listening' : 'Voice input'}
                  >
                    {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>

              <Button
                type="submit"
                size="icon"
                disabled={!prompt.trim() || loading}
                className="h-10 w-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shrink-0"
                aria-label="Send message"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>

            <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
              ResourceFlow AI Copilot · Decision-support output · Verify life-critical matters with incident commanders.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
