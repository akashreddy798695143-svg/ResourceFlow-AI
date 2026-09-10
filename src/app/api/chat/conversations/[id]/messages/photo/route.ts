// Emergency communication chat — share an incident-related photo inside a chat.
// Stored as a base64 data URI on ChatMessage.photoUrl (same approach as the
// incident evidence photo route) — only returned to conversation participants, so
// it is never exposed to unauthorized users.
import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { getConversationForUser, otherParticipant, createChatMessage, serializeMessage } from '@/lib/chat'
import { pushNotification } from '@/lib/notifications'
import { recordAudit, broadcastEvent } from '@/lib/events'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

// POST /api/chat/conversations/[id]/messages/photo — upload a photo message (multipart)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await ctx.params

    const convo = await getConversationForUser(id, user.id)
    if (!convo) return err('Conversation not found', 404)

    const formData = await req.formData()
    const file = formData.get('photo') as File | null
    if (!file || !file.name) return err('No photo file provided', 400)
    if (!ALLOWED_TYPES.includes(file.type)) {
      return err('Invalid file type. Allowed: JPEG, PNG, WebP, GIF', 400)
    }
    if (file.size > MAX_SIZE) return err('Photo too large. Maximum size: 5MB', 400)

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const dataUri = `data:${file.type};base64,${buffer.toString('base64')}`

    const message = await createChatMessage({
      conversationId: id,
      senderId: user.id,
      kind: 'IMAGE',
      photoUrl: dataUri,
      photoMime: file.type,
      photoName: file.name,
    })

    const recipientId = otherParticipant(convo, user.id)
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'CHAT_PHOTO_SENT',
      entityId: message.id,
      newState: `size=${file.size}`,
    })
    await pushNotification({
      type: 'INFO',
      message: `${user.name} sent you a photo`,
      userId: recipientId,
      entityId: id,
    })
    await broadcastEvent({
      type: 'CHAT_MESSAGE',
      label: `${user.name} sent a photo in emergency chat`,
      data: { conversationId: id, recipientId, kind: 'IMAGE' },
    })

    return ok({ message: serializeMessage(message) }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}
