'use client'

import { useState } from 'react'
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react'
import { apiPost } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Message = {
  role: 'assistant' | 'user'
  content: string
}

const STARTER_MESSAGE = 'I can analyze incident reports, risks, resource plans, maps, or any operational question.'

export function AIAssistant() {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: STARTER_MESSAGE },
  ])

  const submit = async () => {
    const value = prompt.trim()
    if (!value || loading) return

    setPrompt('')
    setMessages((current) => [...current, { role: 'user', content: value }])
    setLoading(true)

    try {
      const result = await apiPost<{ content: string }>('/api/ai/chat', { prompt: value })
      setMessages((current) => [...current, { role: 'assistant', content: result.content }])
    } catch (error: any) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: error?.message || 'The assistant is unavailable. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rf-ai-assistant">
      {open && (
        <section className="rf-ai-panel" aria-label="ResourceFlow AI assistant">
          <div className="rf-ai-panel-header">
            <div className="flex items-center gap-2">
              <div className="rf-ai-icon"><Sparkles className="h-4 w-4" /></div>
              <div>
                <p className="text-sm font-semibold">ResourceFlow AI</p>
                <p className="text-[10px] text-muted-foreground font-mono">ANALYSIS ASSISTANT</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close AI assistant">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="rf-ai-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={cn('rf-ai-message', message.role === 'user' && 'rf-ai-message-user')}>
                {message.role === 'assistant' && <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
                <p>{message.content}</p>
              </div>
            ))}
            {loading && (
              <div className="rf-ai-message"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /><p>Analyzing your request...</p></div>
            )}
          </div>

          <div className="rf-ai-composer">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              placeholder="Paste a report or ask anything..."
              aria-label="Message ResourceFlow AI"
              maxLength={4000}
              rows={2}
            />
            <Button size="icon" onClick={submit} disabled={!prompt.trim() || loading} aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="px-3 pb-3 text-[10px] text-muted-foreground">AI analysis supports decisions; verify urgent situations with local emergency services.</p>
        </section>
      )}

      {!open && (
        <Button className="rf-ai-launcher" onClick={() => setOpen(true)} aria-label="Open ResourceFlow AI assistant">
          <Sparkles className="h-4 w-4" />
          <span>Ask AI</span>
        </Button>
      )}
    </div>
  )
}
