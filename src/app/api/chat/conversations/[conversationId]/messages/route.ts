import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { participantIn, otherParticipant } from '@/lib/chat'
import { pushNotification } from '@/lib/notifications'

export async function GET(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const user = await requireAuth()
    const { conversationId } = await params
    const conversation = await db.chatConversation.findUnique({
      where: { id: conversationId },
      select: { participantA: true, participantB: true },
    })
    if (!conversation) return err('Conversation not found', 404)
    if (!participantIn(conversation, user.id)) return err('Forbidden', 403)

    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const before = searchParams.get('before')

    const where = { conversationId }
    if (before) {
      where.createdAt = { lt: new Date(before) }
    }

    const messages = await db.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        kind: true,
        body: true,
        latitude: true,
        longitude: true,
        accuracy: true,
        photoUrl: true,
        photoMime: true,
        photoName: true,
        incidentId: true,
        incidentTitle: true,
        locationLabel: true,
        readAt: true,
        createdAt: true,
        senderId: true,
        sender: { select: { id: true, name: true, role: true } },
      },
    })

    return ok({ messages: messages.reverse(), hasMore: messages.length === limit })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const user = await requireAuth()
    const { conversationId } = await params
    const conversation = await db.chatConversation.findUnique({
      where: { id: conversationId },
      select: { participantA: true, participantB: true },
    })
    if (!conversation) return err('Conversation not found', 404)
    if (!participantIn(conversation, user.id)) return err('Forbidden', 403)

    const body = parseBody(await req.json())
    const { kind, text, latitude, longitude, accuracy, incidentId, incidentTitle, locationLabel, photoBase64, photoMime, photoName } = body

    const validKinds = ['TEXT', 'LOCATION', 'INCIDENT_LOCATION', 'IMAGE']
    if (!kind || !validKinds.includes(kind)) return err('Invalid or missing message kind', 400)

    if (kind === 'TEXT' && (!text || !text.trim())) {
      return err('Text message cannot be empty', 400)
    }

    if (kind === 'LOCATION') {
      if (latitude === undefined || longitude === undefined) {
        return err('Latitude and longitude required for location', 400)
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return err('Invalid coordinates', 400)
      }
    }

    if (kind === 'INCIDENT_LOCATION' && !incidentId) {
      return err('Incident ID required for incident location', 400)
    }

    if (kind === 'IMAGE' && !photoBase64) {
      return err('Photo data required for image message', 400)
    }

    const message = await db.chatMessage.create({
      data: {
        conversationId,
        senderId: user.id,
        kind,
        body: kind === 'TEXT' ? text.trim() : null,
        latitude: kind === 'LOCATION' || kind === 'INCIDENT_LOCATION' ? latitude : null,
        longitude: kind === 'LOCATION' || kind === 'INCIDENT_LOCATION' ? longitude : null,
        accuracy: kind === 'LOCATION' ? accuracy : null,
        incidentId: kind === 'INCIDENT_LOCATION' ? incidentId : null,
        incidentTitle: kind === 'INCIDENT_LOCATION' ? incidentTitle : null,
        locationLabel: kind === 'LOCATION' ? locationLabel : null,
        photoUrl: kind === 'IMAGE' ? `/api/chat/photos/${user.id}/${Date.now()}` : null,
        photoMime: kind === 'IMAGE' ? (photoMime || 'image/jpeg') : null,
        photoName: kind === 'IMAGE' ? (photoName || 'photo.jpg') : null,
      },
      select: {
        id: true,
        kind: true,
        body: true,
        latitude: true,
        longitude: true,
        accuracy: true,
        photoUrl: true,
        photoMime: true,
        photoName: true,
        incidentId: true,
        incidentTitle: true,
        locationLabel: true,
        readAt: true,
        createdAt: true,
        senderId: true,
        sender: { select: { id: true, name: true, role: true } },
      },
    })

    await db.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    const recipientId = otherParticipant(conversation, user.id)
    const sender = await db.user.findUnique({ where: { id: user.id }, select: { name: true } })
    await pushNotification({
      type: 'INFO',
      message: `${sender?.name || 'Someone'} sent you a ${kind === 'TEXT' ? 'message' : kind === 'IMAGE' ? 'photo' : kind === 'LOCATION' ? 'location' : 'incident update'}`,
      userId: recipientId,
      entityId: conversationId,
    })

    return ok({ message }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}
