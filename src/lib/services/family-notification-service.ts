// Family Safety Circle Notification Service
// Sends email notifications to verified family/safety contacts when:
// - Citizen clicks "I'm Safe"
// - Citizen sends Emergency SOS
// - Citizen submits an important safety event
// - Citizen has an important verified emergency status update
//
// Design principles:
// - Only verified contacts (emailVerified = true) receive emails
// - Email failures do NOT break the Safe Check-In or SOS flow
// - Notification status is stored per contact (PENDING/SENT/FAILED)
// - Uses existing Gmail SMTP service (email-service.ts)
// - Does NOT use WhatsApp for Family Safety Circle notifications

import { db } from '@/lib/db'
import { sendEmail, maskEmail } from '@/lib/services/email-service'

export interface FamilyContact {
  id: string
  name: string
  email: string
  relation: string
  emailVerified: boolean
}

export interface SafeCheckInData {
  citizenName: string
  locationName: string | null
  latitude: number | null
  longitude: number | null
  checkInTime: Date
  message?: string | null
}

export interface EmergencySosData {
  citizenName: string
  incidentCode: string
  incidentType: string
  severity: string
  locationName: string
  latitude: number
  longitude: number
  incidentTime: Date
  status: string
  guidance?: string
}

export interface NotificationResult {
  contactId: string
  contactName: string
  email: string
  status: 'SENT' | 'FAILED' | 'SKIPPED'
  error?: string
}

// Send "I'm Safe" email to all verified family contacts
export async function sendSafeCheckInEmails(
  ownerId: string,
  data: SafeCheckInData
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = []

  // Get all verified contacts with email
  const contacts = await db.safetyContact.findMany({
    where: {
      ownerId,
      emailVerified: true,
      email: { not: null },
    },
    select: {
      id: true,
      name: true,
      email: true,
      relation: true,
      emailVerified: true,
    },
  })

  if (contacts.length === 0) {
    return results
  }

  // Send email to each verified contact
  for (const contact of contacts) {
    const result = await sendSafeCheckInEmail({ ...contact, email: contact.email ?? "" }, data)
    results.push(result)

    // Update contact notification status
    await db.safetyContact.update({
      where: { id: contact.id },
      data: {
        notificationStatus: result.status === 'SENT' ? 'SENT' : result.status === 'FAILED' ? 'FAILED' : null,
        lastNotificationAt: result.status === 'SENT' ? new Date() : undefined,
      },
    })
  }

  return results
}

// Send "I'm Safe" email to a single contact
async function sendSafeCheckInEmail(
  contact: FamilyContact,
  data: SafeCheckInData
): Promise<NotificationResult> {
  const subject = `ResourceFlow AI — ${data.citizenName} is Safe`

  const timeStr = data.checkInTime.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const location = data.locationName || 'Location not shared'
  const generalArea = getGeneralArea(data.latitude, data.longitude) || location

  const html = buildSafeCheckInHtml(data, subject, timeStr, generalArea)

  try {
    const result = await sendEmail({
      to: contact.email,
      subject,
      html,
    })

    if (result.ok) {
      console.log('[family-notification] Safe check-in email sent', {
        contactId: contact.id,
        contactName: contact.name,
        email: maskEmail(contact.email),
      })
      return {
        contactId: contact.id,
        contactName: contact.name,
        email: contact.email,
        status: 'SENT',
      }
    } else {
      console.error('[family-notification] Safe check-in email failed', {
        contactId: contact.id,
        email: maskEmail(contact.email),
        error: result.error,
      })
      return {
        contactId: contact.id,
        contactName: contact.name,
        email: contact.email,
        status: 'FAILED',
        error: result.error,
      }
    }
  } catch (e: any) {
    console.error('[family-notification] Safe check-in email error', {
      contactId: contact.id,
      error: e?.message || 'Unknown error',
    })
    return {
      contactId: contact.id,
      contactName: contact.name,
      email: contact.email,
      status: 'FAILED',
      error: e?.message || 'Unknown error',
    }
  }
}

// Send Emergency SOS email to all verified family contacts
export async function sendEmergencySosEmails(
  ownerId: string,
  data: EmergencySosData
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = []

  // Get all verified contacts with email
  const contacts = await db.safetyContact.findMany({
    where: {
      ownerId,
      emailVerified: true,
      email: { not: null },
    },
    select: {
      id: true,
      name: true,
      email: true,
      relation: true,
      emailVerified: true,
    },
  })

  if (contacts.length === 0) {
    return results
  }

  // Send email to each verified contact
  for (const contact of contacts) {
    const result = await sendEmergencySosEmail({ ...contact, email: contact.email ?? "" }, data)
    results.push(result)

    // Update contact notification status
    await db.safetyContact.update({
      where: { id: contact.id },
      data: {
        notificationStatus: result.status === 'SENT' ? 'SENT' : result.status === 'FAILED' ? 'FAILED' : null,
        lastNotificationAt: result.status === 'SENT' ? new Date() : undefined,
      },
    })
  }

  return results
}

// Send Emergency SOS email to a single contact
async function sendEmergencySosEmail(
  contact: FamilyContact,
  data: EmergencySosData
): Promise<NotificationResult> {
  const subject = `ResourceFlow AI — Emergency Alert`

  const timeStr = data.incidentTime.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const html = buildEmergencySosHtml(data, subject, timeStr)

  try {
    const result = await sendEmail({
      to: contact.email,
      subject,
      html,
    })

    if (result.ok) {
      console.log('[family-notification] Emergency SOS email sent', {
        contactId: contact.id,
        contactName: contact.name,
        email: maskEmail(contact.email),
        incidentCode: data.incidentCode,
      })
      return {
        contactId: contact.id,
        contactName: contact.name,
        email: contact.email,
        status: 'SENT',
      }
    } else {
      console.error('[family-notification] Emergency SOS email failed', {
        contactId: contact.id,
        email: maskEmail(contact.email),
        error: result.error,
      })
      return {
        contactId: contact.id,
        contactName: contact.name,
        email: contact.email,
        status: 'FAILED',
        error: result.error,
      }
    }
  } catch (e: any) {
    console.error('[family-notification] Emergency SOS email error', {
      contactId: contact.id,
      error: e?.message || 'Unknown error',
    })
    return {
      contactId: contact.id,
      contactName: contact.name,
      email: contact.email,
      status: 'FAILED',
      error: e?.message || 'Unknown error',
    }
  }
}

// --- Helper functions ---
function getGeneralArea(lat: number | null, lng: number | null): string | null {
  if (!lat || !lng) return null
  return `${lat.toFixed(2)}°, ${lng.toFixed(2)}° (approximate area)`
}

function getSeverityColor(severity: string): string {
  const c: Record<string, string> = { CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#65a30d' }
  return c[severity?.toUpperCase()] || '#6b7280'
}

function formatIncidentType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

function escapeHtml(text: string): string {
  const m: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
  return text.replace(/[&<>"']/g, (c) => m[c])
}

function buildSafeCheckInHtml(d: SafeCheckInData, _s: string, t: string, loc: string): string {
  const msgRow = d.message ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Message</td><td style="padding:8px 0;color:#111827;font-size:14px">${escapeHtml(d.message)}</td></tr>` : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif"><div style="max-width:560px;margin:24px auto;background:white;border-radius:8px"><div style="background:linear-gradient(135deg,#1a1d23 0%,#0f1115 100%);padding:24px 28px;border-bottom:3px solid #22c55e"><div style="color:#f5f5f5;font-size:18px;font-weight:bold">RESOURCEFLOW AI</div><div style="color:#9ca3af;font-size:11px;text-transform:uppercase">Safety Notification</div></div><div style="padding:28px"><div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px"><span style="color:#166534;font-size:14px;font-weight:bold">${d.citizenName} is SAFE</span><p style="margin:4px 0 0 0;color:#15803d;font-size:14px">${d.citizenName} has checked in as safe.</p></div><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Status</td><td style="padding:8px 0;color:#22c55e;font-size:14px;font-weight:bold">SAFE</td></tr><tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Location</td><td style="padding:8px 0;color:#111827;font-size:14px">${loc}</td></tr><tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Time</td><td style="padding:8px 0;color:#111827;font-size:14px">${t}</td></tr>${msgRow}</table></div><div style="background:#f9fafb;padding:18px 28px;color:#6b7280;font-size:12px">Automated notification - Do not reply.</div></div></body></html>`
}

function buildEmergencySosHtml(d: EmergencySosData, _s: string, t: string): string {
  const sevColor = getSeverityColor(d.severity)
  const guideRow = d.guidance ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Guidance</td><td style="padding:8px 0;font-size:14px">${escapeHtml(d.guidance)}</td></tr>` : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif"><div style="max-width:560px;margin:24px auto;background:white;border-radius:8px"><div style="background:linear-gradient(135deg,#7f1d1d 0%,#450a0a 100%);padding:24px 28px;border-bottom:3px solid #ef4444"><div style="color:#f5f5f5;font-size:18px;font-weight:bold">RESOURCEFLOW AI</div><div style="color:#fca5a5;font-size:11px;text-transform:uppercase">Emergency Alert</div></div><div style="padding:28px"><div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px"><span style="color:#991b1b;font-size:14px;font-weight:bold">EMERGENCY SOS ACTIVATED</span><p style="margin:4px 0 0 0;color:#b91c1c;font-size:14px">${d.citizenName} triggered an emergency SOS.</p></div><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Citizen</td><td style="padding:8px 0;font-size:14px;font-weight:bold">${d.citizenName}</td></tr><tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Type</td><td style="padding:8px 0;font-size:14px">${formatIncidentType(d.incidentType)}</td></tr><tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Severity</td><td style="padding:8px 0;font-size:14px;font-weight:bold;color:${sevColor}">${d.severity}</td></tr><tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Location</td><td style="padding:8px 0;font-size:14px">${d.locationName}</td></tr><tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Incident ID</td><td style="padding:8px 0;font-family:monospace;font-size:14px">${d.incidentCode}</td></tr><tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Time</td><td style="padding:8px 0;font-size:14px">${t}</td></tr><tr><td style="padding:8px 0;color:#6b7280;font-size:12px;width:40%">Status</td><td style="padding:8px 0;font-size:14px">${d.status}</td></tr>${guideRow}</table><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin-top:20px"><p style="margin:0 0 8px 0;color:#9a3412;font-size:13px;font-weight:bold">Safety Information</p><ul style="margin:0;padding-left:20px;color:#c2410c;font-size:12px"><li>Emergency responders notified</li><li>Location shared with authorities</li><li>Do not reply to this email</li></ul></div></div><div style="background:#f9fafb;padding:18px 28px;color:#6b7280;font-size:12px">Automated emergency notification - Do not reply.</div></div></body></html>`
}
