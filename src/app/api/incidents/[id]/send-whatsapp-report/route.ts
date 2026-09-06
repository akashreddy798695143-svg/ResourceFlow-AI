// POST /api/incidents/[id]/send-whatsapp-report
// Manually triggers a WhatsApp analysis/resolution report to the citizen's registered phone number.
// Accessible to DISASTER_OFFICER and ADMIN only.
// Citizen NEVER triggers this endpoint — officers use it for manual re-sends.

import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { db } from '@/lib/db'
import { sendWhatsAppReportToCitizen } from '@/lib/services/analysis-report-service'
import { recordAudit } from '@/lib/events'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const { id } = await params

    const incident = await db.incident.findUnique({
      where: { id },
      select: { id: true, incidentCode: true, status: true, citizenPhone: true, reportedById: true },
    })
    if (!incident) return err('Incident not found', 404)

    const result = await sendWhatsAppReportToCitizen(id)

    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'WHATSAPP_REPORT_SENT',
      entityId: id,
      newState: result.ok ? 'SENT' : result.skipped ? 'SKIPPED' : 'FAILED',
      reason: result.ok
        ? `WhatsApp analysis report sent to citizen (${result.phone})`
        : result.reason || result.error || 'Send failed',
    })

    if (result.skipped) {
      return ok({
        sent: false,
        skipped: true,
        reason: result.reason || 'Citizen has no registered phone number',
      })
    }

    return ok({
      sent: result.ok,
      phone: result.phone,
      messageId: result.messageId,
      error: result.error,
      incidentCode: incident.incidentCode,
    })
  } catch (e) {
    return handleAuthError(e)
  }
}

