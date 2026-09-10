import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { getOrCreateConversation, otherParticipant, canMessage } from '@/lib/chat'
import type { Role } from '@prisma/client'

interface ChatPreview {
  kind: string
  text: string
  senderId: string
  createdAt: string
  readAt: string | null
}

function preview(msg: { kind: string; body: string | null; senderId: string; createdAt: Date; readAt: Date | null }, myId: string): ChatPreview {
  if (msg.kind === 'IMAGE') {
    return { kind: 'IMAGE', text: `📷 Photo${msg.senderId === myId ? ' (you)' : ''}`, senderId: msg.senderId, createdAt: msg.createdAt.toISOString(), readAt: msg.readAt?.toISOString() ?? null }
  }
  if (msg.kind === 'LOCATION') {
    return { kind: 'LOCATION', text: `📍 Live location shared${msg.senderId === myId ? ' (you)' : ''}`, senderId: msg.senderId, createdAt: msg.createdAt.toISOString(), readAt: msg.readAt?.toISOString() ?? null }
  }
  if (msg.kind === 'INCIDENT_LOCATION') {
    return { kind: 'INCIDENT_LOCATION', text: `🚨 Incident location shared`, senderId: msg.senderId, createdAt: msg.createdAt.toISOString(), readAt: msg.readAt?.toISOString() ?? null }
  }
  const body = (msg.body || '').trim()
  return { kind: 'TEXT', text: body.slice(0, 90) || '📎 Attachment', senderId: msg.senderId, createdAt: msg.createdAt.toISOString(), readAt: msg.readAt?.toISOString() ?? null }
}

// GET /api/chat/conversations — list the current user's conversations (with other participant info, last message preview, and unread count)
export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth()
    const bare = await db.chatConversation.findMany({
      where: { OR: [{ participantA: user.id }, { participantB: user.id }] },
      orderBy: { updatedAt: 'desc' },
    })
    const otherIds = [...new Set(bare.map((c) => otherParticipant(c, user.id)))]
    const usersMap = new Map(
      (await db.user.findMany({
        where: { id: { in: otherIds } },
        select: { id: true, name: true, role: true, email: true, phone: true },
      })).map((u) => [u.id, u])
    )
    const conversations = await Promise.all(
      bare.map(async (c) => {
        const other = usersMap.get(otherParticipant(c, user.id))
        const lastMessage = await db.chatMessage.findFirst({ where: { conversationId: c.id }, orderBy: { createdAt: 'desc' } })
        const unread = await db.chatMessage.count({ where: { conversationId: c.id, senderId: { not: user.id }, readAt: null } })
        const otherId = otherParticipant(c, user.id)
        return {
          id: c.id,
          participantId: other?.id ?? null,
          participantName: other?.name ?? 'Unknown',
          participantRole: other?.role ?? 'CITIZEN',
          participantEmail: other?.email ?? null,
          participantPhone: other?.phone ?? null,
          lastMessage: lastMessage ? preview(lastMessage, user.id) : null,
          lastAt: (lastMessage?.createdAt ?? c.updatedAt).toISOString(),
          unread,
        }
      })
    )
    return ok({ conversations })
  } catch (e) {
    return handleAuthError(e)
  }
}

// POST /api/chat/conversations — create (or get) a 1:1 conversation with a given recipient. body: { recipientId: string }
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = parseBody(await req.json())
    const recipientId = body.recipientId
    if (!recipientId) return err('recipientId is required', 400)
    const recipient = await db.user.findUnique({ where: { id: recipientId }, select: { id: true, name: true, role: true, active: true, email: true, phone: true } })
    if (!recipient || !recipient.active) return err('Recipient not found', 404)
    if (recipient.id === user.id) return err('You cannot start a conversation with yourself', 400)
    if (!canMessage(user.role as Role, recipient.role as Role)) return err('You are not authorized to message this user', 403)
    const conversation = await getOrCreateConversation(user.id, recipient.id)
    return ok({ conversation: { id: conversation.id, participantId: recipient.id, participantName: recipient.name, participantRole: recipient.role, participantEmail: recipient.email, participantPhone: recipient.phone } }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}