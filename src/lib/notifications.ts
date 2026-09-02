import { db } from '@/lib/db'
import { broadcastEvent } from '@/lib/events'
import type { NotificationType } from '@prisma/client'

// Create an in-app notification + broadcast to dashboards.
export async function pushNotification(params: {
  type: NotificationType
  message: string
  userId?: string
  entityId?: string
}) {
  const n = await db.notification.create({ data: params })
  await broadcastEvent({
    type: 'NOTIFICATION',
    label: `Notification: ${params.type}`,
    data: { id: n.id, type: params.type, message: params.message, entityId: params.entityId },
  })
  return n
}
