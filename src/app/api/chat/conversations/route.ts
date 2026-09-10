// Emergency communication chat — conversation discovery & creation.
// All checks (role matrix, participant membership) are server-enforced using
// the EXISTING ChatConversation / ChatMessage Prisma models. No schema changes.
import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { canMessage, findUserByPhone, getOrCreateConversation, listConversations } from '@/lib/chat'
import { recordAudit, broadcastEvent } from '@/lib/events'

// GET /api/chat/conversations — my conversations (with last message + unread counts)
export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth()
    const conversations = await listConversations(user.id)
    return ok({ conversations })
  } catch (e) {
    return handleAuthError(e)
  }
}

// POST /api/chat/conversations — find/create a 1:1 conversation by recipient phone.
// Body: { phone: string }
// The role matrix (canMessage) and the recipient's active flag are enforced server-side.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json().catch(() => ({}))
    const phone = (body?.phone || '').trim()
    if (!phone) return err('A phone number is required', 400)

    const target = await findUserByPhone(phone)
    if (!target) return err('No active user found with that phone number', 404)
    if (target.id === user.id) return err('You cannot start a conversation with yourself', 400)

    if (!canMessage(user.role, target.role)) {
      return err('You are not authorized to message this recipient', 403)
    }

    const convo = await getOrCreateConversation(user.id, target.id)
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'CHAT_CONVERSATION_STARTED',
      entityId: convo.id,
      reason: `Started emergency chat with ${target.name} (${target.role})`,
    })
    await broadcastEvent({
      type: 'CHAT_MESSAGE',
      label: 'Emergency chat started',
      data: { conversationId: convo.id, recipientId: target.id },
    })

    return ok({
      conversation: {
        id: convo.id,
        participantA: convo.participantA,
        participantB: convo.participantB,
        createdAt: convo.createdAt.toISOString(),
        updatedAt: convo.updatedAt.toISOString(),
      },
      otherParticipant: target,
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
