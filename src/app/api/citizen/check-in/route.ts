// Safe Check-In — mark "I'm Safe" and share status with trusted contacts.
// Contacts that are registered ResourceFlow users get an in-app notification;
// all shared contacts are recorded in the check-in payload for the offline card.
// WhatsApp notifications are sent to all safety contacts.
// Email notifications are sent to verified Family Safety Circle members.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { pushNotification } from '@/lib/notifications'
import { recordAudit } from '@/lib/events'
import { sendWhatsApp, getWhatsAppServiceStatus } from '@/lib/services/whatsapp-service'
import { sendSafeCheckInEmails } from '@/lib/services/family-notification-service'

// WhatsApp notification result for a single contact
interface WhatsAppNotificationResult {
  contactId: string
  contactName: string
  phone: string
  status: 'SENT' | 'FAILED' | 'UNAVAILABLE'
  error?: string
}

// GET /api/citizen/check-in — latest own check-ins
export async function GET() {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const checkIns = await db.safeCheckIn.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    return NextResponse.json({ checkIns })
  } catch (e) {
    return handleAuthError(e)
  }
}

// POST /api/citizen/check-in — create a check-in and notify contacts
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'])
    const body = await req.json().catch(() => ({}))
    const contactIds: string[] = Array.isArray(body.contactIds) ? body.contactIds.map(String) : []
    const message = typeof body.message === 'string' ? body.message.slice(0, 300) : null

    // Validate ownership of every shared contact (privacy: never leak other users' contacts)
    let sharedContacts: { id: string; name: string; phone: string }[] = []
    if (contactIds.length) {
      const owned = await db.safetyContact.findMany({
        where: { ownerId: user.id, id: { in: contactIds } },
        select: { id: true, name: true, phone: true },
      })
      sharedContacts = owned
    }

    // Save check-in first — this must succeed regardless of notification status
    const checkIn = await db.safeCheckIn.create({
      data: {
        userId: user.id,
        isSafe: body.isSafe !== false,
        message,
        latitude: Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : null,
        longitude: Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : null,
        locationName: typeof body.locationName === 'string' ? body.locationName.slice(0, 300) : null,
        sharedWith: JSON.stringify(sharedContacts),
      },
    })

    // Notify contacts who are ResourceFlow users (phone/email match), without exposing requester details
    const notified: string[] = []
    for (const c of sharedContacts) {
      const digits = c.phone.replace(/\D/g, '').slice(-10)
      const contactUser = await db.user.findFirst({
        where: { OR: [{ phone: { endsWith: digits } }, { phone: c.phone }] },
        select: { id: true, name: true },
      })
      if (contactUser) {
        await pushNotification({
          type: 'INFO',
          message: `${user.name} marked "I'm Safe" at ${new Date().toLocaleString()}${message ? ` — "${message}"` : ''}`,
          userId: contactUser.id,
          entityId: checkIn.id,
        })
        notified.push(contactUser.id)
      }
    }

    // Send WhatsApp notifications to all safety contacts
    const whatsappResults: WhatsAppNotificationResult[] = []
    const whatsappStatus = getWhatsAppServiceStatus()

    if (sharedContacts.length > 0) {
      if (whatsappStatus.available) {
        // WhatsApp is configured — send to each contact
        for (const contact of sharedContacts) {
          const result = await sendWhatsAppToContact(user.name, contact, checkIn.id, checkIn.locationName, checkIn.createdAt)
          whatsappResults.push(result)
        }
      } else {
        // WhatsApp not configured — record as unavailable for each contact
        for (const contact of sharedContacts) {
          whatsappResults.push({
            contactId: contact.id,
            contactName: contact.name,
            phone: contact.phone,
            status: 'UNAVAILABLE',
            error: 'WhatsApp notification unavailable',
          })
          // Log the unavailable status
          await db.notificationLog.create({
            data: {
              userId: user.id,
              notificationType: 'SAFE_CHECK_IN',
              channel: 'WHATSAPP',
              recipient: contact.phone,
              title: 'Safety Update',
              message: `${user.name} marked "I'm Safe"`,
              status: 'UNAVAILABLE',
              errorMessage: 'WhatsApp not configured',
            },
          })
        }
      }
    }

    await recordAudit({ userId: user.id, role: user.role, action: 'SAFE_CHECK_IN', entityId: checkIn.id, newState: 'SAFE' })

    // Send email notifications to verified Family Safety Circle members
    // This runs in the background and does not block the response
    let emailResults: { sent: number; failed: number } = { sent: 0, failed: 0 }
    try {
      const emailNotificationResults = await sendSafeCheckInEmails(user.id, {
        citizenName: user.name,
        locationName: checkIn.locationName,
        latitude: checkIn.latitude,
        longitude: checkIn.longitude,
        checkInTime: checkIn.createdAt,
        message: checkIn.message,
      })
      emailResults = {
        sent: emailNotificationResults.filter((r) => r.status === 'SENT').length,
        failed: emailNotificationResults.filter((r) => r.status === 'FAILED').length,
      }
    } catch (emailError) {
      console.error('[check-in] Email notification error:', emailError)
      // Email failures do not break the check-in flow
    }

    // Build response message based on WhatsApp results
    const sentCount = whatsappResults.filter((r) => r.status === 'SENT').length
    const failedCount = whatsappResults.filter((r) => r.status === 'FAILED').length
    const unavailableCount = whatsappResults.filter((r) => r.status === 'UNAVAILABLE').length

    let responseMessage = `Safe status recorded and shared with ${sharedContacts.length} trusted contact(s).`
    if (sentCount > 0) {
      responseMessage += ` WhatsApp notification sent to ${sentCount} contact(s).`
    }
    if (failedCount > 0) {
      responseMessage += ` ${failedCount} WhatsApp notification(s) failed.`
    }
    if (unavailableCount > 0) {
      responseMessage += ' WhatsApp notification unavailable.'
    }
    if (emailResults.sent > 0) {
      responseMessage += ` You're marked as Safe. Your Family Safety Circle has been notified by email.`
    }
    if (emailResults.failed > 0) {
      responseMessage += ` ${emailResults.failed} email notification(s) failed.`
    }

    return NextResponse.json(
      {
        checkIn,
        sharedWith: sharedContacts.map((c) => ({ id: c.id, name: c.name })), // never return phone back to client
        notifiedAppUsers: notified.length,
        whatsapp: {
          sent: sentCount,
          failed: failedCount,
          unavailable: unavailableCount,
        },
        email: {
          sent: emailResults.sent,
          failed: emailResults.failed,
        },
        message: responseMessage,
      },
      { status: 201 }
    )
  } catch (e) {
    return handleAuthError(e)
  }
}

// Send WhatsApp notification to a single safety contact
async function sendWhatsAppToContact(
  citizenName: string,
  contact: { id: string; name: string; phone: string },
  checkInId: string,
  locationName: string | null,
  checkInTime: Date
): Promise<WhatsAppNotificationResult> {
  const timeStr = checkInTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  const location = locationName || 'Location not shared'

  const message = `ResourceFlow AI Safety Update:
${citizenName} has checked in as SAFE.
Location: ${location}
Time: ${timeStr}
This is an automated safety notification.`

  // Create PENDING notification log entry
  const log = await db.notificationLog.create({
    data: {
      notificationType: 'SAFE_CHECK_IN',
      channel: 'WHATSAPP',
      recipient: contact.phone,
      title: 'Safety Update',
      message: `${citizenName} marked "I'm Safe"`,
      status: 'PENDING',
    },
  })

  try {
    const result = await sendWhatsApp(contact.phone, message)

    // Update notification log with result
    await db.notificationLog.update({
      where: { id: log.id },
      data: result.ok
        ? { status: 'SENT', sentAt: new Date() }
        : { status: 'FAILED', errorMessage: result.error },
    })

    return {
      contactId: contact.id,
      contactName: contact.name,
      phone: contact.phone,
      status: result.ok ? 'SENT' : 'FAILED',
      error: result.ok ? undefined : result.error,
    }
  } catch (e: any) {
    // Update notification log with failure
    await db.notificationLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage: e?.message || 'Unexpected error' },
    })

    return {
      contactId: contact.id,
      contactName: contact.name,
      phone: contact.phone,
      status: 'FAILED',
      error: e?.message || 'Unexpected error',
    }
  }
}
