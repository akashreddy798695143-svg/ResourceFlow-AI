'use client'

// Emergency Communication — conversation list.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { apiGet, apiPost, ApiError } from '@/lib/api-client'
import { useRealtimeSubscription } from '@/lib/use-realtime'
import { toast } from 'sonner'
import { RefreshCw, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { ChatConversation } from '@/lib/types'

const ROLE_LABEL: Record<string, string> = {
  CITIZEN: 'Citizen',
  RESPONDER: 'Responder',
  DISASTER_OFFICER: 'Disaster Officer',
  ADMIN: 'Admin',
}
const ROLE_STYLE: Record<string, string> = {
  CITIZEN: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  RESPONDER: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  DISASTER_OFFICER: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ADMIN: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
}

function initials(name?: string | null) {
  if (!name) return 'U'
  return name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function lastMessagePreview(m: ChatConversation['lastMessage']) {
  if (!m) return 'No messages yet'
  if (m.kind === 'IMAGE') return '📎 Photo'
  if (m.kind === 'LOCATION' || m.kind === 'INCIDENT_LOCATION') return '📍 Location shared'
  if (m.kind === 'TEXT') return m.body || 'Message'
  return 'Message'
}

function formatTime(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60 * 1000) return 'now'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 24 * 60 * 60 * 1000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString()
}

export function ChatListView() {
  const { navigate } = useRouter()
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [phone, setPhone] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ conversations: ChatConversation[] }>('/api/chat/conversations')
      setConversations(res.conversations)
    } catch (e: any) {
      toast.error(e.message || 'Could not load conversations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  useRealtimeSubscription('CHAT_MESSAGE', useCallback(() => load(), [load]))

  const startChat = async () => {
    const trimmed = phone.trim()
    if (!trimmed) return
    setStarting(true)
    try {
      const res = await apiPost<{ conversation: { id: string }; otherParticipant: any }>(
        '/api/chat/conversations',
        { phone: trimmed }
      )
      toast.success(`Chat opened with ${res.otherParticipant?.name || 'user'}`)
      setPhone('')
      load()
      navigate(`/chat/${res.conversation.id}`)
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.data?.error || e.message : e.message
      toast.error(msg || 'Could not start chat')
    } finally {
      setStarting(false)
    }
  }

  const open = (id: string) => navigate(`/chat/${id}`)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Emergency Communication</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Secure 1:1 chat with citizens and response staff. Find a recipient by phone.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Start a new chat */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Start a new conversation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Recipient registered phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  startChat()
                }
              }}
            />
            <Button onClick={startChat} disabled={starting || !phone.trim()}>
              {starting ? 'Starting…' : 'Find & Chat'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Conversations are strictly 1:1 and governed by role-based access. The server
            verifies you may message the recipient before a chat is created.
          </p>
        </CardContent>
      </Card>
            {/* Conversation list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Your conversations</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && conversations.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No conversations yet. Start one above.
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((c) => {
                const other = c.otherParticipant
                const isUnread = c.unreadCount > 0
                return (
                  <button
                    key={c.id}
                    onClick={() => open(c.id)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-lg p-2.5 text-left transition-all rf-focus-ring',
                      isUnread ? 'bg-accent/40' : 'hover:bg-accent/40'
                    )}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback
                        className={cn(
                          'bg-primary/20 text-primary font-bold',
                          isUnread && 'bg-primary/30'
                        )}
                      >
                        {initials(other?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">
                          {other?.name || 'Unknown'}
                        </span>
                        {other?.role && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'font-mono text-[9px] uppercase',
                              ROLE_STYLE[other.role]
                            )}
                          >
                            {ROLE_LABEL[other.role] || other.role}
                          </Badge>
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                          {formatTime(c.lastMessage?.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'text-xs truncate',
                            isUnread ? 'text-foreground font-medium' : 'text-muted-foreground'
                          )}
                        >
                          {lastMessagePreview(c.lastMessage)}
                        </span>
                      </div>
                    </div>
                    {isUnread && (
                      <Badge className="ml-auto h-5 min-w-[20px] rounded-full bg-sev-CRITICAL/15 text-sev-CRITICAL border-sev-CRITICAL font-mono text-[10px]">
                        {c.unreadCount > 9 ? '9+' : c.unreadCount}
                      </Badge>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
