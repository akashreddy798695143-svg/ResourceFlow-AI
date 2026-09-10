// Emergency communication chat — send a text / location / incident-location message.
// Photos are handled on a dedicated multipart route (messages/photo) to keep
// base64 payloads separate from the JSON contract.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { getConversationForUser, otherParticipant, createChatMessage, serializeMessage } from '@/lib/chat'
import { pushNotification } from '@/lib/notifications'
import { recordAudit, broadcastEvent } from '@/lib/events'

const ALLOWED_TEXT_KINDS = ['TEXT', 'LOCATION', 'INCIDENT_LOCATION']

// POST /api/chat/conversations/[id]/messages — send a message (JSON body)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await ctx.params

    const convo = await getConversationForUser(id, user.id)
    if (!convo) return err('Conversation not found', 404)

    const body = await req.json().catch(() => ({}))
    const kind = String(body?.kind || 'TEXT').toUpperCase()
    if (!ALLOWED_TEXT_KINDS.includes(kind)) return err('Invalid message kind', 400)

    // Location messages must carry valid coordinates.
    if (kind === 'LOCATION' || kind === 'INCIDENT_LOCATION') {
      const lat = Number(body?.latitude)
      const lng = Number(body?.longitude)
      if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return err('Valid latitude and longitude are required for location messages', 400)
      }
    }

    // INCIDENT_LOCATION may only reference an incident visible to BOTH participants
    // (the sender and the recipient), so private citizen incident data is not leaked.
    if (kind === 'INCIDENT_LOCATION' && body?.incidentId) {
      const inc = await db.incident.findUnique({
        where: { id: body.incidentId },
        select: { reportedById: true },
      })
      const otherId = otherParticipant(convo, user.id)
      const visible = !!inc && (inc.reportedById === user.id || inc.reportedById === otherId)
      if (!visible) return err('Incident not found or not visible to both participants', 404)
    }

    const message = await createChatMessage({
      conversationId: id,
      senderId: user.id,
      kind,
      body: body?.body ?? null,
      latitude: body?.latitude ?? null,
      longitude: body?.longitude ?? null,
      accuracy: body?.accuracy ?? null,
      incidentId: body?.incidentId ?? null,
      incidentTitle: body?.incidentTitle ?? null,
      locationLabel: body?.locationLabel ?? null,
    })

    const recipientId = otherParticipant(convo, user.id)
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'CHAT_MESSAGE_SENT',
      entityId: message.id,
      newState: `kind=${kind}`,
    })
    await pushNotification({
      type: 'INFO',
      message: `${user.name} sent you a message`,
      userId: recipientId,
      entityId: id,
    })
    await broadcastEvent({
      type: 'CHAT_MESSAGE',
      label: `${user.name} sent a message in emergency chat`,
      data: { conversationId: id, recipientId, kind },
    })

    return ok({ message: serializeMessage(message) }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}
