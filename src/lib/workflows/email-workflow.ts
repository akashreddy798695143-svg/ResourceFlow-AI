// Email workflow — orchestrates the automated resolution report emails.
// Called by resolveIncident() after the report is generated.
//
// Flow:
//   INCIDENT RESOLVED
//     → generate_report()  (already done by resolveIncident)
//     → send_resolution_email()  (this module)
//       → create EmailNotification row (PENDING)
//       → render citizen HTML + officer HTML
//       → send via email-service (SMTP)
//       → update row to SENT or FAILED
//     → save_email_delivery_status()
//     → create_audit_log()  (EMAIL_REPORT_GENERATED + EMAIL_REPORT_SENT/FAILED)
//     → show_notification()  (in-app notification to officer)
//
// Idempotency: the Incident.resolutionEmailSent flag prevents duplicate sends.
// If the incident is resolved again (e.g. via a re-trigger), no second email is sent.

import { db } from '@/lib/db'
import { recordAudit, recordIncidentEvent } from '@/lib/events'
import { pushNotification } from '@/lib/notifications'
import { sendEmail } from '@/lib/services/email-service'
import {
  renderCitizenReportEmail,
  renderOfficerReportEmail,
  type PublicReportData,
  type OfficerReportData,
} from '@/lib/services/email-templates'

function safeJsonArr(s: string | null): any[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// Main entry: send the resolution email(s) for an incident.
// Idempotent — checks resolutionEmailSent first.
// Never throws into the resolveIncident path (failures are recorded, not raised).
export async function sendResolutionEmails(incidentId: string, resolvedByUserId?: string) {
  try {
    const incident = await db.incident.findUnique({
      where: { id: incidentId },
      include: {
        reportedBy: true,
        events: { orderBy: { createdAt: 'asc' } },
        assignments: { orderBy: { assignedAt: 'asc' } },
        recommendations: { orderBy: { createdAt: 'asc' } },
        approvals: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!incident) return
    if (incident.status !== 'RESOLVED') return

    // Idempotency guard — never send duplicate resolution emails
    if (incident.resolutionEmailSent) {
      return
    }

    // Build the public + internal report data
    const publicData: PublicReportData = {
      incidentCode: incident.incidentCode,
      incidentType: incident.type.replace(/_/g, ' '),
      location: incident.location,
      status: incident.status,
      reportedAt: incident.createdAt.toISOString(),
      resolvedAt: incident.resolvedAt?.toISOString() || new Date().toISOString(),
      responseTimeMin:
        incident.acknowledgedAt && incident.assignedAt
          ? Math.round((incident.acknowledgedAt.getTime() - incident.assignedAt.getTime()) / 60000)
          : null,
      resolutionTimeMin: incident.resolvedAt
        ? Math.round((incident.resolvedAt.getTime() - incident.createdAt.getTime()) / 60000)
        : null,
    }

    // Mark the incident as "email attempt in progress" early to prevent concurrent sends
    await db.incident.update({
      where: { id: incidentId },
      data: { resolutionEmailSent: true, resolutionEmailSentAt: new Date() },
    })

    await recordIncidentEvent(incidentId, 'EMAIL_REPORT_GENERATED', {
      label: 'Final incident report generated — preparing email delivery',
    })
    await recordAudit({
      userId: resolvedByUserId,
      action: 'EMAIL_REPORT_GENERATED',
      entityId: incidentId,
      newState: 'GENERATED',
      reason: 'Automatic report generation on incident resolution',
    })

    // ─── 1) Citizen public report email ─────────────────────────
    if (incident.reportedBy?.email) {
      const { subject, html } = renderCitizenReportEmail(publicData)
      const citizenEmail = incident.reportedBy.email

      // Create PENDING EmailNotification row first
      const notif = await db.emailNotification.create({
        data: {
          incidentId,
          recipientEmail: citizenEmail,
          recipientUserId: incident.reportedById,
          emailType: 'CITIZEN_RESOLUTION_REPORT',
          subject,
          status: 'PENDING',
        },
      })

      // Send (this may fail gracefully if SMTP is not configured)
      const result = await sendEmail({ to: citizenEmail, subject, html })

      if (result.ok) {
        await db.emailNotification.update({
          where: { id: notif.id },
          data: { status: 'SENT', sentAt: new Date() },
        })
        await recordIncidentEvent(incidentId, 'EMAIL_REPORT_SENT', {
          label: 'Citizen resolution report email sent',
          recipient: 'citizen',
          messageId: result.messageId,
        })
        await recordAudit({
          userId: resolvedByUserId,
          action: 'EMAIL_REPORT_SENT',
          entityId: incidentId,
          newState: 'SENT (citizen)',
          reason: 'Public resolution report delivered to reporting citizen',
        })
      } else {
        await db.emailNotification.update({
          where: { id: notif.id },
          data: { status: 'FAILED', errorMessage: result.error },
        })
        await recordIncidentEvent(incidentId, 'EMAIL_REPORT_FAILED', {
          label: 'Citizen resolution report email failed',
          recipient: 'citizen',
          error: result.error,
        })
        await recordAudit({
          userId: resolvedByUserId,
          action: 'EMAIL_REPORT_FAILED',
          entityId: incidentId,
          newState: 'FAILED (citizen)',
          reason: result.error || 'Unknown email failure',
        })
      }
    }

    // ─── 2) Officer internal report email ──────────────────────
    // Send to every authorized officer + admin on record. In a real deployment this
    // would come from a roster; for the hackathon we send to all DISASTER_OFFICER + ADMIN users.
    const officers = await db.user.findMany({
      where: { role: { in: ['DISASTER_OFFICER', 'ADMIN'] }, active: true },
      select: { id: true, email: true, name: true, role: true },
    })

    if (officers.length > 0) {
      const officerData = await buildOfficerReportData(incident)
      const { subject, html } = renderOfficerReportEmail(officerData)

      for (const officer of officers) {
        const notif = await db.emailNotification.create({
          data: {
            incidentId,
            recipientEmail: officer.email,
            recipientUserId: officer.id,
            emailType: 'OFFICER_RESOLUTION_REPORT',
            subject,
            status: 'PENDING',
          },
        })
        const result = await sendEmail({ to: officer.email, subject, html })
        if (result.ok) {
          await db.emailNotification.update({
            where: { id: notif.id },
            data: { status: 'SENT', sentAt: new Date() },
          })
          await recordAudit({
            userId: resolvedByUserId,
            action: 'EMAIL_REPORT_SENT',
            entityId: incidentId,
            newState: 'SENT (officer)',
            reason: `Internal resolution report delivered to ${officer.role}`,
          })
        } else {
          await db.emailNotification.update({
            where: { id: notif.id },
            data: { status: 'FAILED', errorMessage: result.error },
          })
          await recordIncidentEvent(incidentId, 'EMAIL_REPORT_FAILED', {
            label: `Officer resolution report email failed (${officer.role})`,
            recipient: 'officer',
            error: result.error,
          })
          await recordAudit({
            userId: resolvedByUserId,
            action: 'EMAIL_REPORT_FAILED',
            entityId: incidentId,
            newState: 'FAILED (officer)',
            reason: result.error || 'Unknown email failure',
          })
        }
      }
    }

    // In-app notification to officers about email delivery status
    const failedCount = await db.emailNotification.count({
      where: { incidentId, status: 'FAILED' },
    })
    const sentCount = await db.emailNotification.count({
      where: { incidentId, status: 'SENT' },
    })
    if (failedCount > 0 && sentCount === 0) {
      await pushNotification({
        type: 'WARNING',
        message: `Resolution report email delivery failed for ${incident.incidentCode}. Report generated — retry available.`,
        entityId: incidentId,
      })
    } else if (sentCount > 0) {
      await pushNotification({
        type: 'INFO',
        message: `Resolution report email sent for ${incident.incidentCode} (${sentCount} recipient${sentCount > 1 ? 's' : ''}).`,
        entityId: incidentId,
      })
    }
  } catch (e: any) {
    // Email workflow must NEVER break incident resolution. Log + record, but don't rethrow.
    console.error('[email-workflow] sendResolutionEmails failed:', e)
    await recordIncidentEvent(incidentId, 'EMAIL_REPORT_FAILED', {
      label: `Email workflow error: ${String(e?.message ?? e).slice(0, 200)}`,
    }).catch(() => {})
    await recordAudit({
      action: 'EMAIL_REPORT_FAILED',
      entityId: incidentId,
      reason: `Email workflow exception: ${String(e?.message ?? e).slice(0, 200)}`,
    }).catch(() => {})
  }
}

// Build the detailed officer report data from the incident + relations
async function buildOfficerReportData(incident: any): Promise<OfficerReportData> {
  const recommendations = incident.recommendations || []
  const approvals = incident.approvals || []
  const assignments = incident.assignments || []
  const events = incident.events || []

  // Recommended resources (from RESOURCE_OPTIMIZATION recommendations)
  const recommendedResources: Array<{ code: string; name: string; reason: string }> = []
  for (const rec of recommendations) {
    if (rec.recType === 'RESOURCE_OPTIMIZATION' || rec.recType === 'REASSIGNMENT') {
      try {
        const payload = JSON.parse(rec.payload)
        if (payload?.recommended_resource) {
          recommendedResources.push({
            code: payload.recommended_resource.code,
            name: payload.recommended_resource.name,
            reason: payload.recommended_resource.reason || '',
          })
        }
      } catch {}
    }
  }

  // Approved resources (from APPROVED approvals)
  const approvedResources: string[] = []
  for (const a of approvals) {
    if (a.decision === 'APPROVED' && a.resourceId) {
      const resource = await db.resource.findUnique({ where: { id: a.resourceId }, select: { resourceCode: true } })
      if (resource) approvedResources.push(resource.resourceCode)
    }
  }

  // Assignment history
  const assignmentHistory = await Promise.all(
    assignments.map(async (a: any) => {
      const r = await db.resource.findUnique({ where: { id: a.resourceId }, select: { resourceCode: true } })
      return { code: r?.resourceCode || '—', status: a.status, at: a.assignedAt.toISOString() }
    })
  )

  // Response timeline
  const responseTimeline = [
    { label: 'Report Received', at: incident.createdAt.toISOString() },
    { label: 'Assigned', at: incident.assignedAt?.toISOString() || null },
    { label: 'Acknowledged', at: incident.acknowledgedAt?.toISOString() || null },
    { label: 'En Route', at: incident.startedAt?.toISOString() || null },
    { label: 'On Scene', at: incident.arrivedAt?.toISOString() || null },
    { label: 'Resolved', at: incident.resolvedAt?.toISOString() || null },
  ]

  const delays = events.filter((e: any) => e.eventType === 'RESPONSE_DELAYED').length
  const reassignments = events.filter((e: any) => e.eventType === 'REASSIGNMENT').length
  const escalations = incident.escalationLevel || 0
  const resourceFailures = events.filter((e: any) => e.eventType === 'RESOURCE_UNAVAILABLE').length

  // Cluster info
  let clusterCode: string | null = null
  let clusterSize = 1
  if (incident.clusterId) {
    const cluster = await db.incidentCluster.findUnique({ where: { id: incident.clusterId } })
    if (cluster) {
      clusterCode = cluster.clusterCode
      try {
        const ids = JSON.parse(cluster.incidentIds)
        clusterSize = Array.isArray(ids) ? ids.length : 1
      } catch {}
    }
  }

  return {
    incidentCode: incident.incidentCode,
    incidentType: incident.type.replace(/_/g, ' '),
    location: incident.location,
    status: incident.status,
    reportedAt: incident.createdAt.toISOString(),
    resolvedAt: incident.resolvedAt?.toISOString() || new Date().toISOString(),
    responseTimeMin:
      incident.acknowledgedAt && incident.assignedAt
        ? Math.round((incident.acknowledgedAt.getTime() - incident.assignedAt.getTime()) / 60000)
        : null,
    resolutionTimeMin: incident.resolvedAt
      ? Math.round((incident.resolvedAt.getTime() - incident.createdAt.getTime()) / 60000)
      : null,
    description: incident.description,
    aiSeverity: incident.aiSeverity,
    aiPeopleAffected: incident.aiPeopleAffected,
    aiUrgentNeeds: safeJsonArr(incident.aiUrgentNeeds),
    aiRoadBlocked: incident.aiRoadBlocked,
    aiRiskFactors: safeJsonArr(incident.aiRiskFactors),
    riskScore: incident.riskScore,
    riskLevel: incident.riskLevel,
    riskReasons: safeJsonArr(incident.riskReasons),
    clusterCode,
    clusterSize,
    recommendedResources,
    approvedResources,
    assignmentHistory,
    responseTimeline,
    delays,
    reassignments,
    escalations,
    resourceFailures,
    finalOutcome: 'Resolved',
  }
}

// Retry a failed email — called by the protected API endpoint.
// Only retries emails that are currently FAILED.
export async function retryResolutionEmail(
  incidentId: string,
  emailNotificationId: string,
  retriedByUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const notif = await db.emailNotification.findUnique({ where: { id: emailNotificationId } })
  if (!notif || notif.incidentId !== incidentId) {
    return { ok: false, error: 'Email notification not found for this incident' }
  }
  if (notif.status === 'SENT') {
    return { ok: false, error: 'Email already sent — no retry needed' }
  }

  await recordAudit({
    userId: retriedByUserId,
    action: 'EMAIL_REPORT_RETRIED',
    entityId: incidentId,
    newState: 'RETRYING',
    reason: `Retry requested for ${notif.emailType.toLowerCase().replace(/_/g, ' ')}`,
  })

  // Re-fetch the incident to rebuild the email
  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: { reportedBy: true, events: { orderBy: { createdAt: 'asc' } }, assignments: { orderBy: { assignedAt: 'asc' } }, recommendations: true, approvals: true },
  })
  if (!incident) return { ok: false, error: 'Incident not found' }

  let subject: string, html: string
  if (notif.emailType === 'CITIZEN_RESOLUTION_REPORT') {
    const publicData: PublicReportData = {
      incidentCode: incident.incidentCode,
      incidentType: incident.type.replace(/_/g, ' '),
      location: incident.location,
      status: incident.status,
      reportedAt: incident.createdAt.toISOString(),
      resolvedAt: incident.resolvedAt?.toISOString() || new Date().toISOString(),
      responseTimeMin:
        incident.acknowledgedAt && incident.assignedAt
          ? Math.round((incident.acknowledgedAt.getTime() - incident.assignedAt.getTime()) / 60000)
          : null,
      resolutionTimeMin: incident.resolvedAt
        ? Math.round((incident.resolvedAt.getTime() - incident.createdAt.getTime()) / 60000)
        : null,
    }
    const rendered = renderCitizenReportEmail(publicData)
    subject = rendered.subject
    html = rendered.html
  } else {
    const officerData = await buildOfficerReportData(incident)
    const rendered = renderOfficerReportEmail(officerData)
    subject = rendered.subject
    html = rendered.html
  }

  // Mark as PENDING (retrying)
  await db.emailNotification.update({
    where: { id: emailNotificationId },
    data: { status: 'PENDING', errorMessage: null },
  })

  const result = await sendEmail({ to: notif.recipientEmail, subject, html })

  if (result.ok) {
    await db.emailNotification.update({
      where: { id: emailNotificationId },
      data: { status: 'SENT', sentAt: new Date(), errorMessage: null },
    })
    await recordAudit({
      userId: retriedByUserId,
      action: 'EMAIL_REPORT_SENT',
      entityId: incidentId,
      newState: 'SENT (retry)',
      reason: 'Retry succeeded',
    })
    await recordIncidentEvent(incidentId, 'EMAIL_REPORT_SENT', {
      label: 'Resolution report email sent (retry)',
      recipient: notif.emailType === 'CITIZEN_RESOLUTION_REPORT' ? 'citizen' : 'officer',
      messageId: result.messageId,
    })
    return { ok: true }
  } else {
    await db.emailNotification.update({
      where: { id: emailNotificationId },
      data: { status: 'FAILED', errorMessage: result.error },
    })
    await recordAudit({
      userId: retriedByUserId,
      action: 'EMAIL_REPORT_FAILED',
      entityId: incidentId,
      newState: 'FAILED (retry)',
      reason: result.error || 'Retry failed',
    })
    return { ok: false, error: result.error }
  }
}
