import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { participantIn } from '@/lib/chat'

// POST /api/chat/messages/read — mark messages as read in a conversation
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = parseBody(await req.json())
    const { conversationId, messageIds } = body

    if (!conversationId) return err('conversationId is required', 400)

    const conversation = await db.chatConversation.findUnique({
      where: { id: conversationId },
      select: { participantA: true, participantB: true },
    })

    if (!conversation) return err('Conversation not found', 404)
    if (!participantIn(conversation, user.id)) return err('Forbidden', 403)

    // Mark all unread messages from the other participant as read
    const otherParticipantId = conversation.participantA === user.id ? conversation.participantB : conversation.participantA

    if (messageIds && messageIds.length > 0) {
      // Mark specific messages as read
      await db.chatMessage.updateMany({
        where: {
          id: { in: messageIds },
          conversationId,
          senderId: otherParticipantId,
          readAt: null,
        },
        data: { readAt: new Date() },
      })
    } else {
      // Mark all unread messages from other participant as read
      await db.chatMessage.updateMany({
        where: {
          conversationId,
          senderId: otherParticipantId,
          readAt: null,
        },
        data: { readAt: new Date() },
      })
    }

    const unreadCount = await db.chatMessage.count({
      where: {
        conversationId,
        senderId: otherParticipantId,
        readAt: null,
      },
    })

    return ok({ unreadCount })
  } catch (e) {
    return handleAuthError(e)
  }
}