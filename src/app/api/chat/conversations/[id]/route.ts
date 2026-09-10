// Emergency communication chat — fetch a conversation + its messages.
// Membership is enforced: only a participant can read a conversation, and
// reading marks received (other-party) messages as read.
import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import {
  getConversationForUser,
  getOtherParticipantProfile,
  getMessages,
  markMessagesRead,
  serializeMessage,
} from '@/lib/chat'

// GET /api/chat/conversations/[id] — full conversation + messages
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await ctx.params

    const convo = await getConversationForUser(id, user.id)
    if (!convo) return err('Conversation not found', 404)

    const [messages, other] = await Promise.all([
      getMessages(id),
      getOtherParticipantProfile(convo, user.id),
    ])
    // Reading marks all messages received from the other participant as read.
    await markMessagesRead(id, user.id)

    return ok({
      conversation: {
        id: convo.id,
        participantA: convo.participantA,
        participantB: convo.participantB,
        createdAt: convo.createdAt.toISOString(),
        updatedAt: convo.updatedAt.toISOString(),
      },
      otherParticipant: other,
      messages: messages.map(serializeMessage),
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
