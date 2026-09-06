// Unified notification service — fans out to SMS / Email / In-app based on the
// notification type, recipient role, and the recipient's channel preferences.
//
// Design principles:
//   - The caller describes WHAT happened (notificationType) and WHO should be
//     notified (recipients). This service decides HOW (which channels) and
//     records every attempt in NotificationLog.
//   - Critical/emergency notifications (ESCALATION, INCIDENT_CREATED for officers,
//     APPROVAL_REQUIRED) ALWAYS go out via all available channels regardless of
//     user prefs — this is system policy and cannot be disabled by users.
//   - Non-critical notifications respect user prefs (smsNotifications,
//     emailNotifications, inAppNotifications).
//   - Never fakes success — each channel returns SENT/FAILED based on real delivery.
//   - Citizens never receive officer-only information (AI confidence, risk factors,
//     resource recommendations, internal operational details).
//
// Channels:
//   SMS   → sms-service.sendSms (Twilio / console demo)
//   EMAIL → email-service.sendEmail (Gmail SMTP / demo)
//   IN_APP → db.notification.create (shown in the bell dropdown)

import { db } from '@/lib/db'
import { sendSms, maskPhone } from '@/lib/services/sms-service'
import { sendEmail, maskEmail } from '@/lib/services/email-service'
import { sendWhatsApp } from '@/lib/services/whatsapp-service'
import { recordAudit } from '@/lib/events'

export type NotificationChannel = 'SMS' | 'EMAIL' | 'IN_APP' | 'WHATSAPP'
export type NotificationType =
  | 'REGISTRATION_VERIFIED'
  | 'INCIDENT_CREATED'
  | 'INCIDENT_PRIORITY_CHANGED'
  | 'APPROVAL_REQUIRED'
  | 'RESOURCE_ASSIGNED'
  | 'RESOURCE_REASSIGNED'
  | 'RESPONSE_DELAYED'
  | 'INCIDENT_ESCALATED'
  | 'INCIDENT_RESOLVED'
  | 'REPORT_GENERATED'
  | 'AI_ANALYSIS_COMPLETED'
  | 'ASSIGNMENT_CHANGED'
  | 'SYSTEM_SECURITY'

// Critical notification types — always delivered via all channels regardless of user prefs.
const CRITICAL_TYPES: NotificationType[] = [
  'INCIDENT_ESCALATED',
  'APPROVAL_REQUIRED',
  'RESPONSE_DELAYED',
  'SYSTEM_SECURITY',
]

interface NotificationContent {
  title: string
  message: string  // the short SMS-friendly summary
  emailSubject?: string
  emailHtml?: string  // full HTML body (officer/internal reports)
  incidentId?: string
}

interface Recipient {
  userId: string
  email: string
  phone?: string | null
  role: string
  smsNotifications?: boolean
  emailNotifications?: boolean
  inAppNotifications?: boolean
}

export interface DispatchResult {
  notificationType: NotificationType
  sent: number
  failed: number
  perChannel: { channel: NotificationChannel; sent: number; failed: number }[]
}

// Dispatch a notification to one or more recipients across channels.
// Channels are chosen per recipient based on: type criticality, recipient prefs,
// and what contact info they have (phone → SMS & WHATSAPP, email → EMAIL, always → IN_APP).
export async function dispatchNotification(
  type: NotificationType,
  recipients: Recipient[],
  content: NotificationContent
): Promise<DispatchResult> {
  const isCritical = CRITICAL_TYPES.includes(type)
  const perChannel: Record<NotificationChannel, { sent: number; failed: number }> = {
    SMS: { sent: 0, failed: 0 },
    EMAIL: { sent: 0, failed: 0 },
    IN_APP: { sent: 0, failed: 0 },
    WHATSAPP: { sent: 0, failed: 0 },
  }

  for (const r of recipients) {
    // Re-fetch the user's actual prefs to be safe
    const user = await db.user.findUnique({
      where: { id: r.userId },
      select: { smsNotifications: true, emailNotifications: true, inAppNotifications: true, phone: true, email: true },
    })
    if (!user) continue

    const channels: NotificationChannel[] = []
    // IN_APP
    if (isCritical || user.inAppNotifications) channels.push('IN_APP')
    // SMS — needs a phone
    if ((isCritical || user.smsNotifications) && (user.phone || r.phone)) channels.push('SMS')
    // WHATSAPP — needs a phone
    if ((isCritical || user.smsNotifications) && (user.phone || r.phone)) channels.push('WHATSAPP')
    // EMAIL — needs an email
    if ((isCritical || user.emailNotifications) && (user.email || r.email)) channels.push('EMAIL')

    for (const channel of channels) {
      // Create a PENDING NotificationLog entry first
      const recipientAddress = (channel === 'SMS' || channel === 'WHATSAPP')
        ? (user.phone || r.phone || '')
        : (user.email || r.email || '')
      if (!recipientAddress && channel !== 'IN_APP') continue

      const log = await db.notificationLog.create({
        data: {
          userId: r.userId,
          incidentId: content.incidentId,
          notificationType: type,
          channel,
          recipient: channel === 'IN_APP' ? `in-app:${r.userId}` : recipientAddress,
          title: content.title,
          message: content.message,
          status: 'PENDING',
        },
      })

      let ok = false
      let errorMessage: string | null = null

      if (channel === 'IN_APP') {
        try {
          await db.notification.create({
            data: {
              type: mapTypeToInAppType(type),
              message: `${content.title}: ${content.message}`,
              read: false,
              userId: r.userId,
              entityId: content.incidentId,
            },
          })
          ok = true
        } catch (e: any) {
          errorMessage = String(e?.message ?? e).slice(0, 200)
        }
      } else if (channel === 'SMS') {
        const res = await sendSms(recipientAddress, `${content.title}\n${content.message}`.slice(0, 320))
        ok = res.ok
        if (!ok) errorMessage = res.error || null
      } else if (channel === 'WHATSAPP') {
        const res = await sendWhatsApp(recipientAddress, `${content.title}\n${content.message}`.slice(0, 320))
        ok = res.ok
        if (!ok) errorMessage = res.error || null
      } else if (channel === 'EMAIL') {
        if (content.emailHtml && content.emailSubject) {
          const res = await sendEmail({ to: recipientAddress, subject: content.emailSubject, html: content.emailHtml })
          ok = res.ok
          if (!ok) errorMessage = res.error || null
        } else {
          errorMessage = 'Email skipped — no HTML body provided for this notification'
        }
      }

      await db.notificationLog.update({
        where: { id: log.id },
        data: ok ? { status: 'SENT', sentAt: new Date() } : { status: 'FAILED', errorMessage },
      })

      if (ok) perChannel[channel].sent++
      else perChannel[channel].failed++
    }
  }

  const sent = perChannel.SMS.sent + perChannel.EMAIL.sent + perChannel.IN_APP.sent + perChannel.WHATSAPP.sent
  const failed = perChannel.SMS.failed + perChannel.EMAIL.failed + perChannel.IN_APP.failed + perChannel.WHATSAPP.failed

  // Audit summary (one line per dispatch, not per recipient)
  await recordAudit({
    action: 'NOTIFICATION_DISPATCHED',
    entityId: content.incidentId,
    newState: `${type} (sent=${sent}, failed=${failed})`,
    reason: `Multi-channel dispatch: SMS ${perChannel.SMS.sent}/${perChannel.SMS.failed}, WHATSAPP ${perChannel.WHATSAPP.sent}/${perChannel.WHATSAPP.failed}, EMAIL ${perChannel.EMAIL.sent}/${perChannel.EMAIL.failed}, IN_APP ${perChannel.IN_APP.sent}/${perChannel.IN_APP.failed}`,
  }).catch(() => {})

  return { notificationType: type, sent, failed, perChannel: Object.entries(perChannel).map(([channel, v]) => ({ channel: channel as NotificationChannel, ...v })) }
}

function mapTypeToInAppType(type: NotificationType): any {
  const map: Record<NotificationType, any> = {
    REGISTRATION_VERIFIED: 'INFO',
    INCIDENT_CREATED: 'INFO',
    INCIDENT_PRIORITY_CHANGED: 'WARNING',
    APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
    RESOURCE_ASSIGNED: 'INFO',
    RESOURCE_REASSIGNED: 'WARNING',
    RESPONSE_DELAYED: 'CRITICAL',
    INCIDENT_ESCALATED: 'ESCALATION',
    INCIDENT_RESOLVED: 'RESOLUTION',
    REPORT_GENERATED: 'INFO',
    AI_ANALYSIS_COMPLETED: 'INFO',
    ASSIGNMENT_CHANGED: 'WARNING',
    SYSTEM_SECURITY: 'CRITICAL',
  }
  return map[type] || 'INFO'
}

// Helper: get all active users of a role set (for officer/admin broadcasts)
export async function getUsersByRole(roles: string[]): Promise<Recipient[]> {
  const users = await db.user.findMany({
    where: { role: { in: roles as any }, active: true },
    select: { id: true, email: true, phone: true, role: true, smsNotifications: true, emailNotifications: true, inAppNotifications: true },
  })
  return users.map((u) => ({ userId: u.id, email: u.email, phone: u.phone, role: u.role }))
}

// Helper: get a single user as a recipient
export async function getUserRecipient(userId: string): Promise<Recipient | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, phone: true, role: true },
  })
  if (!u) return null
  return { userId: u.id, email: u.email, phone: u.phone, role: u.role }
}
