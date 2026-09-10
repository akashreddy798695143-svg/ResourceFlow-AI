import { db } from '@/lib/db'
import type { Role } from '@prisma/client'

// Secure 1:1 in-app chat.
// Sender/receiver relationship matrix — the ONLY flows allowed (server-enforced.
//   Citizens (incl. registered volunteers) ↔ Officer / Admin / Responder
//   Officers / Admins / Responders ↔ Citizens (incl. volunteers)
// Internal staff may also coordinate with each other as needed by the workflows.
export const CHAT_ALLOWED_TARGETS: Record<Role, Role[]> = {
  CITIZEN: ['DISASTER_OFFICER', 'ADMIN', 'RESPONDER'],
  RESPONDER: ['DISASTER_OFFICER', 'ADMIN', 'CITIZEN'],
  DISASTER_OFFICER: ['ADMIN', 'RESPONDER', 'CITIZEN'],
  ADMIN: ['DISASTER_OFFICER', 'RESPONDER', 'CITIZEN'],
}

export function canMessage(sender: Role, recipient: Role): boolean {
  return (CHAT_ALLOWED_TARGETS[sender] || []).includes(recipient)
}

// Normalize participant ids so (A,B) is stored canonically (A < B).
export function normalizeParticipants(a: string, b: string): { participantA: string; participantB: string } {
  const [participantA, participantB] = [a, b].sort()
  return { participantA, participantB }
}

// Fetch or create the 1:1 conversation between two users.
export async function getOrCreateConversation(a: string, b: string) {
  const { participantA, participantB } = normalizeParticipants(a, b)
  return db.chatConversation.upsert({
    where: { participantA_participantB: { participantA, participantB } },
    update: {},
    create: { participantA, participantB },
  })
}

export function participantIn(conversation: { participantA: string; participantB: string }, userId: string): boolean {
  return conversation.participantA === userId || conversation.participantB === userId
}

// The other participant id in a conversation.
export function otherParticipant(conversation: { participantA: string; participantB: string }, userId: string): string {
  return conversation.participantA === userId ? conversation.participantB : conversation.participantA
}

// Resolve a target user by phone for chat initiation (minimal safe profile only).
// Cititsens use this to find an authorised officer/admin/responder; staff use it to
// find a citizen. Privacy-masked to id/name/role at the API boundary.
export async function findUserByPhone(phone: string) {
  return db.user.findFirst({
    where: { phone, active: true },
    select: { id: true, name: true, role: true },
  })
}

// Fetch a conversation only if the given user is actually a participant.
export async function getConversationForUser(id: string, userId: string) {
  return db.chatConversation.findFirst({
    where: {
      id,
      OR: [{ participantA: userId }, { participantB: userId }],
    },
  })
}

// Fetch the public profile of the other participant in a conversation.
export async function getOtherParticipantProfile(
  conversation: { participantA: string; participantB: string },
  userId: string
) {
  const otherId = otherParticipant(conversation, userId)
  return db.user.findUnique({
    where: { id: otherId },
    select: { id: true, name: true, role: true },
  })
}

// Total unread count for the current user across all of their conversations
// (messages received from the other participant that are still unread).
export async function countUnreadForUser(userId: string) {
  const convos = await db.chatConversation.findMany({
    where: { OR: [{ participantA: userId }, { participantB: userId }] },
    select: { id: true },
  })
  const ids = convos.map((c) => c.id)
  if (ids.length === 0) return 0
    return db.chatMessage.count({
    where: { conversationId: { in: ids }, senderId: { not: userId }, readAt: null },
  })
}

// All messages for a conversation (newest 100, ordered oldest-first).
export async function getMessages(conversationId: string) {
  const latest = await db.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { sender: { select: { id: true, name: true, role: true } } },
  })
  latest.reverse()
  return latest
}

// Mark every message received from the other participant as read.
export async function markMessagesRead(conversationId: string, userId: string) {
  await db.chatMessage.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  })
}

// List conversations for a user with last-message + unread counts.
export async function listConversations(userId: string, limit = 50) {
  const convos = await db.chatConversation.findMany({
    where: { OR: [{ participantA: userId }, { participantB: userId }] },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: {
      _count: {
        select: {
          messages: { where: { readAt: null, senderId: { not: userId } } },
        },
      },
    },
  })
  if (convos.length === 0) return []

  const otherIds = convos.map((c) => otherParticipant(c, userId))
  const users = await db.user.findMany({
    where: { id: { in: otherIds } },
    select: { id: true, name: true, role: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  const convoIds = convos.map((c) => c.id)
  const latest = await db.chatMessage.findMany({
    where: { conversationId: { in: convoIds } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      conversationId: true,
      kind: true,
      body: true,
      senderId: true,
      createdAt: true,
      photoName: true,
    },
  })
  const lastByConv = new Map<string, (typeof latest)[number]>()
  for (const m of latest) {
    if (!lastByConv.has(m.conversationId)) lastByConv.set(m.conversationId, m)
  }

  return convos.map((c) => {
    const last = lastByConv.get(c.id) ?? null
    return {
      id: c.id,
      participantA: c.participantA,
      participantB: c.participantB,
      otherParticipant: userMap.get(otherParticipant(c, userId)) ?? null,
      lastMessage: last
        ? {
            id: last.id,
            kind: last.kind,
            body: last.body,
            senderId: last.senderId,
            createdAt: last.createdAt.toISOString(),
            photoName: last.photoName,
          }
                : null,
      unreadCount: c._count.messages,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }
  })
}

// Create a chat message of any kind. Returns the created record (with sender).
export async function createChatMessage(params: {
  conversationId: string
  senderId: string
  kind: string
  body?: string | null
  latitude?: number | null
  longitude?: number | null
  accuracy?: number | null
  photoUrl?: string | null
  photoMime?: string | null
  photoName?: string | null
  incidentId?: string | null
  incidentTitle?: string | null
  locationLabel?: string | null
}) {
  return db.chatMessage.create({
    data: {
      conversationId: params.conversationId,
      senderId: params.senderId,
      kind: params.kind,
      body: params.body ?? null,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      accuracy: params.accuracy ?? null,
      photoUrl: params.photoUrl ?? null,
      photoMime: params.photoMime ?? null,
      photoName: params.photoName ?? null,
      incidentId: params.incidentId ?? null,
      incidentTitle: params.incidentTitle ?? null,
      locationLabel: params.locationLabel ?? null,
    },
    include: { sender: { select: { id: true, name: true, role: true } } },
  })
}

// Convert a Prisma ChatMessage into a JSON-safe payload for the client.
export function serializeMessage(m: {
  id: string
  conversationId: string
  senderId: string
  sender?: { id: string; name: string; role: string } | null
  kind: string
  body: string | null
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  photoUrl: string | null
  photoMime: string | null
  photoName: string | null
  incidentId: string | null
  incidentTitle: string | null
  locationLabel: string | null
  readAt: Date | null
  createdAt: Date
}) {
  const toIso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null)
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    sender: m.sender ? { id: m.sender.id, name: m.sender.name, role: m.sender.role } : null,
    kind: m.kind,
    body: m.body,
    latitude: m.latitude,
    longitude: m.longitude,
    accuracy: m.accuracy,
    photoUrl: m.photoUrl,
    photoMime: m.photoMime,
    photoName: m.photoName,
    incidentId: m.incidentId,
    incidentTitle: m.incidentTitle,
    locationLabel: m.locationLabel,
    readAt: toIso(m.readAt),
    createdAt: toIso(m.createdAt),
  }
}