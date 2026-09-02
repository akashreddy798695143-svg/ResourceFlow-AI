import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { maskEmail } from '@/lib/services/email-service'
import type { Role } from '@prisma/client'

// GET /api/incidents/[id]/email-status
// Citizens see ONLY their own email status (recipientUserId == their id).
// Officers/admins see all email status entries for the incident, but the recipient
// email is masked to avoid exposing other users' addresses to non-admins.
// Admins see the full recipient email.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await ctx.params
    const incident = await db.incident.findUnique({ where: { id } })
    if (!incident) return err('Incident not found', 404)

    // Citizen: only their own emails + only for their own incident
    if (user.role === 'CITIZEN') {
      if (incident.reportedById !== user.id) return err('Forbidden', 403)
      const emails = await db.emailNotification.findMany({
        where: { incidentId: id, recipientUserId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          emailType: true,
          subject: true,
          status: true,
          sentAt: true,
          errorMessage: true,
          createdAt: true,
          // recipientEmail is the citizen's own — safe to return unmasked
          recipientEmail: true,
        },
      })
      return ok({
        incidentCode: incident.incidentCode,
        resolutionEmailSent: incident.resolutionEmailSent,
        resolutionEmailSentAt: incident.resolutionEmailSentAt,
        emails,
      })
    }

    // Responder: no access to email status
    if (user.role === 'RESPONDER') {
      return err('Forbidden — insufficient role', 403)
    }

    // Officer/Admin: all emails for this incident (email masked unless admin)
    const emails = await db.emailNotification.findMany({
      where: { incidentId: id },
      orderBy: { createdAt: 'asc' },
    })
    const isAdmin = user.role === 'ADMIN'
    const masked = emails.map((e) => ({
      ...e,
      recipientEmail: isAdmin ? e.recipientEmail : maskEmail(e.recipientEmail),
    }))
    return ok({
      incidentCode: incident.incidentCode,
      resolutionEmailSent: incident.resolutionEmailSent,
      resolutionEmailSentAt: incident.resolutionEmailSentAt,
      emails: masked,
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
