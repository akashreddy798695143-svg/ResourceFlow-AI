'use client'

// Emergency Communication — single conversation view.
// Supports text, GPS location (only after geolocation permission), and photos.
// Messages/photos/locations are only returned to conversation participants.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { useAuth } from '@/lib/use-auth'
import { apiGet, apiPost, apiUploadForm, ApiError } from '@/lib/api-client'
import { useRealtimeSubscription } from '@/lib/use-realtime'
import { toast } from 'sonner'
import { ArrowLeft, Send, ImageIcon, MapPin, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ChatConversation, ChatMessage, ChatParticipant } from '@/lib/types'

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
  return name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()
}
function formatTime(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleString()
}
function staticMapUrl(lat: number, lng: number) {
  const base = 'https://staticmap.openstreetmap.de/staticmap.php'
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: '15',
    size: '300x160',
    markers: `${lat},${lng},red-pushpin`,
  })
  return `${base}?${params.toString()}`
}
function openInMaps(lat: number, lng: number) {
  window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer')
}

// Show a shared location: static map preview + open-in-maps + copy coords.
function LocationPreview({
  lat,
  lng,
  accuracy,
  label,
}: { lat: number; lng: number; accuracy: number | null; label: string | null }) {
  return (
    <div className="space-y-1">
      <div className="rounded-md border border-border overflow-hidden bg-muted/20">
        <img
          src={staticMapUrl(lat, lng)}
          alt={`Shared location ${lat.toFixed(5)}, ${lng.toFixed(5)}`}
          className="w-full h-auto object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = '' }}
        />
      </div>
      <div className="text-[11px] flex flex-wrap items-center gap-1.5 text-muted-foreground">
        <MapPin className="h-3 w-3" />
        <span>{lat.toFixed(5)}, {lng.toFixed(5)}</span>
        {accuracy != null && <span>(±{Math.round(accuracy)} m)</span>}
        {label && <span>— {label}</span>}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => openInMaps(lat, lng)}>
          <ExternalLink className="h-3 w-3" /> Open in Maps
        </Button>
        <Button
          variant="outline" size="sm" className="h-7 text-[11px] gap-1"
          onClick={async () => {
            try { await navigator.clipboard.writeText(`${lat}, ${lng}`); toast.success('Coordinates copied') }
            catch { toast(`Lat: ${lat}, Lng: ${lng}`) }
          }}
        >
          <Copy className="h-3 w-3" /> Copy coords
        </Button>
      </div>
    </div>
  )
}
interface BubbleProps {
  msg: ChatMessage
  isOwn: boolean
}
function MessageBubble({ msg, isOwn }: BubbleProps) {
  const sender = msg.sender
  return (
    <div className={cn('flex max-w-[80%] flex-col gap-1', isOwn ? 'self-end' : 'self-start')}>
      {!isOwn && sender ? (
        <div className="flex items-center gap-1.5 mb-0.5">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="bg-primary/20 text-primary text-[9px] font-bold">
              {initials(sender.name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-[10px] font-medium">{sender.name}</span>
          {sender.role && (
            <Badge variant="outline" className={cn('font-mono text-[8px]', ROLE_STYLE[sender.role])}>
              {ROLE_LABEL[sender.role] || sender.role}
            </Badge>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1.5 mb-0.5">
          {sender?.role && (
            <Badge variant="outline" className={cn('font-mono text-[8px]', ROLE_STYLE[sender.role])}>
              {ROLE_LABEL[sender.role] || sender.role}
            </Badge>
          )}
        </div>
      )}
      <Card
        className={cn(
          'px-3 py-2 text-sm',
          isOwn ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-card border border-border rounded-bl-none'
        )}
      >
        {msg.kind === 'IMAGE' && msg.photoUrl ? (
          <div className="space-y-1">
            <img src={msg.photoUrl} alt={msg.photoName || 'Shared photo'} className="max-w-[240px] max-h-[260px] rounded object-cover" />
            {msg.photoName && <p className="text-[10px] opacity-80">{msg.photoName}</p>}
          </div>
        ) : msg.kind === 'LOCATION' || msg.kind === 'INCIDENT_LOCATION' ? (
          msg.latitude != null && msg.longitude != null ? (
            <LocationPreview lat={msg.latitude} lng={msg.longitude} accuracy={msg.accuracy} label={msg.locationLabel || msg.incidentTitle || null} />
          ) : (
            <span className="text-muted-foreground">Location unavailable</span>
          )
        ) : (
          <p className="whitespace-pre-wrap break-words">{msg.body || ''}</p>
        )}
      </Card>
      <span className="text-[9px] text-muted-foreground/60">{formatTime(msg.createdAt)}</span>
    </div>
  )
}
export function ChatConversationView({ conversationId }: { conversationId: string }) {
  const { navigate } = useRouter()
  const { user } = useAuth()
  const [conversation, setConversation] = useState<ChatConversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{
        conversation: any
        otherParticipant: ChatParticipant | null
        messages: ChatMessage[]
      }>(`/api/chat/conversations/${conversationId}`)
      setConversation({
        id: res.conversation.id,
        participantA: res.conversation.participantA,
        participantB: res.conversation.participantB,
        otherParticipant: res.otherParticipant,
        lastMessage: null,
        unreadCount: 0,
        createdAt: res.conversation.createdAt,
        updatedAt: res.conversation.updatedAt,
      })
      setMessages(res.messages)
    } catch (e: any) {
      toast.error(e.message || 'Could not load conversation')
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000) // reliable poll for new messages
    return () => clearInterval(interval)
  }, [load])

  // Live refresh from the realtime hub; polling covers the case where it is down.
  useRealtimeSubscription('CHAT_MESSAGE', useCallback(() => load(), [load]))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const sendMessage = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const res = await apiPost<{ message: ChatMessage }>(
        `/api/chat/conversations/${conversationId}/messages`,
        { kind: 'TEXT', body }
      )
      setMessages((prev) => [...prev, res.message])
      setText('')
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.data?.error || e.message : e.message
      toast.error(msg || 'Message not sent')
    } finally {
      setSending(false)
    }
  }

  const sendLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Location is not available on this device.')
      return
    }
    // Location is only sent after the browser resolves the position, which
    // requires the user to grant GPS permission.
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await apiPost(`/api/chat/conversations/${conversationId}/messages`, {
            kind: 'LOCATION',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          })
          toast.success('Location shared')
          load()
        } catch (e: any) {
          toast.error(e.message || 'Location not shared')
        }
      },
      () => { toast.error('Location permission is required to share your location.') },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  const sendPhoto = async () => {
    if (!photoFile) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(photoFile.type)) {
      toast.error('Invalid file type. Allowed: JPEG, PNG, WebP, GIF')
      return
    }
    setSending(true)
    try {
      const form = new FormData()
      form.append('photo', photoFile)
      const res = await apiUploadForm<{ message: ChatMessage }>(
        `/api/chat/conversations/${conversationId}/messages/photo`,
        form
      )
      setMessages((prev) => [...prev, res.message])
      setPhotoFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      toast.success('Photo shared')
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.data?.error || e.message : e.message
      toast.error(msg || 'Photo not shared')
    } finally {
      setSending(false)
    }
  }
    return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 py-2 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => navigate('/chat')} aria-label="Back to conversations">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {conversation?.otherParticipant ? (
          <>
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/20 text-primary font-bold">
                {initials(conversation.otherParticipant.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium truncate">{conversation.otherParticipant.name}</span>
                {conversation.otherParticipant.role && (
                  <Badge variant="outline" className={cn('font-mono text-[9px] uppercase', ROLE_STYLE[conversation.otherParticipant.role])}>
                    {ROLE_LABEL[conversation.otherParticipant.role] || conversation.otherParticipant.role}
                  </Badge>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">Emergency chat — secure & role-gated</span>
            </div>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Loading conversation…</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto rf-scroll px-1 py-3 space-y-3">
        {loading && messages.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading messages…</div>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} msg={m} isOwn={m.senderId === user?.id} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="p-2 border-t border-border bg-card/50">
        {photoFile ? (
          <div className="mb-2 flex items-center gap-2 text-xs">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{photoFile.name}</span>
            <span className="ml-auto text-muted-foreground">{(photoFile.size / 1024).toFixed(0)} KB</span>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            placeholder="Type a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            rows={1}
            className="min-h-[36px] max-h-32 flex-1"
          />
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach a photo"
            disabled={sending}
          >
            <ImageIcon className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={sendLocation}
            aria-label="Share location"
            disabled={sending}
          >
            <MapPin className="h-5 w-5" />
          </Button>
          <Button
            onClick={photoFile ? sendPhoto : sendMessage}
            disabled={sending || (!photoFile && !text.trim())}
            size="sm"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending…' : photoFile ? 'Send photo' : 'Send'}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Location is shared only after you grant GPS permission. Photos and locations are visible only to you and the recipient.
        </p>
      </div>
    </div>
  )
}