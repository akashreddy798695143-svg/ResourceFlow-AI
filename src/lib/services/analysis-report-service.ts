// Analysis report service — generates the AI analysis report after the incident
// agent runs and dispatches it to authorized officers/responders.
//
// What it does:
//   - Builds the AnalysisReportData from the incident + AI recommendation
//   - Sends a concise SMS summary to officers (≤160 chars)
//   - Sends a full HTML email to officers (with AI confidence, risk factors,
//     recommended resources — all internal info)
//   - Creates a NotificationLog entry for each channel
//   - NEVER sends AI confidence / risk factors / resource recommendations to citizens
//
// This is wired into runIncidentWorkflow() right after the AI analysis step.

import { db } from '@/lib/db'
import { sendSms } from '@/lib/services/sms-service'
import { sendEmail } from '@/lib/services/email-service'
import { sendWhatsApp } from '@/lib/services/whatsapp-service'
import { renderAnalysisReportEmail, renderIncidentEventEmail, type AnalysisReportData } from '@/lib/services/email-templates'
import { recordIncidentEvent, recordAudit } from '@/lib/events'
import { dispatchNotification, getUsersByRole, type NotificationType } from '@/lib/services/notification-service'
import { maskPhone } from '@/lib/services/sms-service'

// Build the analysis report data from an incident
async function buildAnalysisData(incidentId: string): Promise<AnalysisReportData | null> {
  const incident = await db.incident.findUnique({ where: { id: incidentId } })
  if (!incident) return null

  // Get the most recent INCIDENT_ANALYSIS recommendation
  const analysisRec = await db.aIRecommendation.findFirst({
    where: { incidentId, recType: 'INCIDENT_ANALYSIS' },
    orderBy: { createdAt: 'desc' },
  })
  // Get the most recent RESOURCE_OPTIMIZATION recommendation for recommended resources
  const resourceRec = await db.aIRecommendation.findFirst({
    where: { incidentId, recType: 'RESOURCE_OPTIMIZATION' },
    orderBy: { createdAt: 'desc' },
  })

  let analysis: any = null
  if (analysisRec) {
    try { analysis = JSON.parse(analysisRec.payload) } catch {}
  }
  let resourcePayload: any = null
  if (resourceRec) {
    try { resourcePayload = JSON.parse(resourceRec.payload) } catch {}
  }

  const recommendedResources = resourcePayload?.recommended_resource
    ? [{ code: resourcePayload.recommended_resource.code, name: resourcePayload.recommended_resource.name, etaMin: resourcePayload.recommended_resource.eta_minutes }]
    : []

  return {
    incidentCode: incident.incidentCode,
    incidentType: incident.type.replace(/_/g, ' '),
    description: incident.description,
    detectedLanguage: detectLanguage(incident.description),
    location: incident.location,
    latitude: incident.latitude,
    longitude: incident.longitude,
    severity: analysis?.severity || incident.aiSeverity || 'UNKNOWN',
    peopleAffected: analysis?.people_affected_estimate ?? incident.aiPeopleAffected ?? null,
    urgentNeeds: analysis?.urgent_needs || safeJsonArr(incident.aiUrgentNeeds),
    roadBlocked: analysis?.road_blocked ?? incident.aiRoadBlocked,
    infrastructureDamage: analysis?.infrastructure_damage || safeJsonArr(incident.aiInfrastructureDamage),
    riskFactors: analysis?.risk_factors || safeJsonArr(incident.aiRiskFactors),
    riskScore: incident.riskScore,
    riskLevel: incident.riskLevel,
    aiConfidence: analysis?.confidence ?? incident.aiConfidence,
    recommendedResources,
    missingInformation: analysis?.missing_information || safeJsonArr(incident.aiMissingInfo),
    analysisTimestamp: new Date().toISOString(),
  }
}

// Naive language detection: Telugu (Telugu script), Hindi (Devanagari), else English
function detectLanguage(text: string): string {
  if (!text) return 'unknown'
  if (/[\u0C00-\u0C7F]/.test(text)) return 'Telugu'
  if (/[\u0900-\u097F]/.test(text)) return 'Hindi'
  return 'English'
}

function safeJsonArr(s: string | null): any[] {
  if (!s) return []
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}

// Generate the concise SMS summary for officers (≤160 chars)
function buildAnalysisSmsSummary(d: AnalysisReportData): string {
  const needs = d.urgentNeeds.slice(0, 3).join(', ')
  const road = d.roadBlocked ? 'Road: BLOCKED' : 'Road: clear'
  const priority = d.riskLevel || d.severity
  const people = d.peopleAffected != null ? `~${d.peopleAffected}` : '?'
  return [
    'RESOURCEFLOW AI Analysis',
    `Incident: ${d.incidentCode}`,
    `Type: ${d.incidentType}`,
    `Location: ${d.location}`,
    `Priority: ${priority}`,
    `People affected: ${people}`,
    road,
    needs ? `Required: ${needs}` : '',
    'Officer review required.',
  ].filter(Boolean).join('\n').slice(0, 480)
}

// Build a citizen-safe WhatsApp message (no AI confidence, no risk factors, no internal detail)
function buildCitizenWhatsAppMessage(incidentCode: string, incidentType: string, location: string, status: string): string {
  const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  return [
    '🚨 RESOURCEFLOW AI — Incident Update',
    `━━━━━━━━━━━━━━━━━━━━`,
    `Incident: ${incidentCode}`,
    `Type: ${incidentType}`,
    `Location: ${location}`,
    `Status: ${status}`,
    ``,
    `Your report has been received and our AI system has completed its analysis. Emergency responders have been notified and resources are being coordinated.`,
    ``,
    `📋 What happens next:`,
    `• Authorized officers are reviewing the AI analysis`,
    `• Resources are being allocated to your location`,
    `• You will receive further updates as the situation progresses`,
    ``,
    `⏱ Updated: ${ts}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Powered by ResourceFlow AI`,
  ].join('\n')
}

// Build a citizen-safe WhatsApp resolution summary
function buildCitizenWhatsAppResolutionMessage(incidentCode: string, incidentType: string, location: string, resolutionTimeMin: number | null): string {
  const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  const timeStr = resolutionTimeMin ? `${resolutionTimeMin} minutes` : 'promptly'
  return [
    '✅ RESOURCEFLOW AI — Incident Resolved',
    `━━━━━━━━━━━━━━━━━━━━`,
    `Incident: ${incidentCode}`,
    `Type: ${incidentType}`,
    `Location: ${location}`,
    `Status: RESOLVED`,
    ``,
    `Your incident has been successfully resolved by our emergency response team in ${timeStr}.`,
    ``,
    `📊 A full incident report has been generated. Thank you for reporting this emergency and helping keep your community safe.`,
    ``,
    `⏱ Resolved: ${ts}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Powered by ResourceFlow AI`,
  ].join('\n')
}

// Send WhatsApp analysis report to the citizen who reported the incident.
// Uses the citizen's registered phone number from the incident record.
// Message is citizen-safe: no AI confidence scores, no internal risk data.
export async function sendWhatsAppReportToCitizen(incidentId: string): Promise<{
  ok: boolean
  phone?: string
  messageId?: string
  error?: string
  skipped?: boolean
  reason?: string
}> {
  try {
    const incident = await db.incident.findUnique({
      where: { id: incidentId },
      select: {
        incidentCode: true,
        type: true,
        location: true,
        status: true,
        citizenPhone: true,
        reportedById: true,
        resolvedAt: true,
        createdAt: true,
      },
    })
    if (!incident) return { ok: false, error: 'Incident not found' }

    // Resolve citizen phone: prefer citizenPhone from incident, fallback to user profile
    let phone = incident.citizenPhone
    if (!phone && incident.reportedById) {
      const user = await db.user.findUnique({ where: { id: incident.reportedById }, select: { phone: true } })
      phone = user?.phone || null
    }
    if (!phone) {
      return { ok: false, skipped: true, reason: 'Citizen has no registered phone number' }
    }

    // Determine if resolved
    const isResolved = incident.status === 'RESOLVED'
    let message: string
    if (isResolved) {
      const resolutionTimeMin = incident.resolvedAt
        ? Math.max(1, Math.round((incident.resolvedAt.getTime() - incident.createdAt.getTime()) / 60000))
        : null
      message = buildCitizenWhatsAppResolutionMessage(
        incident.incidentCode,
        incident.type.replace(/_/g, ' '),
        incident.location,
        resolutionTimeMin
      )
    } else {
      message = buildCitizenWhatsAppMessage(
        incident.incidentCode,
        incident.type.replace(/_/g, ' '),
        incident.location,
        incident.status
      )
    }

    // Log before send
    const log = await db.notificationLog.create({
      data: {
        userId: incident.reportedById,
        incidentId,
        notificationType: isResolved ? 'INCIDENT_RESOLVED' : 'AI_ANALYSIS_COMPLETED',
        channel: 'WHATSAPP',
        recipient: maskPhone(phone),
        title: isResolved ? `Incident Resolved: ${incident.incidentCode}` : `Analysis Report: ${incident.incidentCode}`,
        message: message.slice(0, 480),
        status: 'PENDING',
      },
    })

    const result = await sendWhatsApp(phone, message)

    await db.notificationLog.update({
      where: { id: log.id },
      data: result.ok
        ? { status: 'SENT', sentAt: new Date() }
        : { status: result.unavailable ? 'SKIPPED' : 'FAILED', errorMessage: result.error },
    })

    await recordIncidentEvent(incidentId, 'WHATSAPP_REPORT_SENT', {
      label: `WhatsApp analysis report sent to citizen (${maskPhone(phone)})`,
      ok: result.ok,
      unavailable: result.unavailable,
    })

    return {
      ok: result.ok,
      phone: maskPhone(phone),
      messageId: result.messageId,
      error: result.error,
    }
  } catch (e: any) {
    console.error('[analysis-report] sendWhatsAppReportToCitizen failed:', e)
    return { ok: false, error: e?.message || 'Unexpected error' }
  }
}

// Main entry: send the analysis report to authorized officers/responders.
// Called by runIncidentWorkflow after AI analysis completes.
export async function sendAnalysisReport(incidentId: string) {
  try {
    const data = await buildAnalysisData(incidentId)
    if (!data) return

    const officers = await getUsersByRole(['DISASTER_OFFICER', 'ADMIN'])
    if (officers.length === 0) return

    // 1) SMS summary to officers who have a phone
    const smsSummary = buildAnalysisSmsSummary(data)
    for (const officer of officers) {
      if (!officer.phone) continue
      const log = await db.notificationLog.create({
        data: {
          userId: officer.userId,
          incidentId,
          notificationType: 'AI_ANALYSIS_COMPLETED',
          channel: 'SMS',
          recipient: officer.phone,
          title: 'AI Analysis Report',
          message: smsSummary,
          status: 'PENDING',
        },
      })
      const res = await sendSms(officer.phone, smsSummary)
      await db.notificationLog.update({
        where: { id: log.id },
        data: res.ok ? { status: 'SENT', sentAt: new Date() } : { status: 'FAILED', errorMessage: res.error },
      })
    }

    // 2) Full HTML email to officers
    const { subject, html } = renderAnalysisReportEmail(data)
    for (const officer of officers) {
      if (!officer.email) continue
      const log = await db.notificationLog.create({
        data: {
          userId: officer.userId,
          incidentId,
          notificationType: 'AI_ANALYSIS_COMPLETED',
          channel: 'EMAIL',
          recipient: officer.email,
          title: subject,
          message: `AI Analysis Report for ${data.incidentCode}`,
          status: 'PENDING',
        },
      })
      const res = await sendEmail({ to: officer.email, subject, html })
      await db.notificationLog.update({
        where: { id: log.id },
        data: res.ok ? { status: 'SENT', sentAt: new Date() } : { status: 'FAILED', errorMessage: res.error },
      })
    }

    // 3) In-app notification to officers via the unified dispatcher
    await dispatchNotification(
      'AI_ANALYSIS_COMPLETED',
      officers,
      {
        title: `AI Analysis: ${data.incidentCode}`,
        message: `${data.incidentType} at ${data.location} — severity ${data.severity}, risk ${data.riskLevel || '—'}. Officer review required.`,
        incidentId,
      }
    )

    // 4) WhatsApp notification to citizen (citizen-safe, no internal AI detail)
    //    Runs independently — never throws if WhatsApp is unconfigured.
    await sendWhatsAppReportToCitizen(incidentId).catch((e) =>
      console.warn('[analysis-report] WhatsApp citizen notification skipped:', e?.message)
    )

    await recordIncidentEvent(incidentId, 'AI_ANALYSIS_REPORT_SENT', {
      label: 'AI analysis report dispatched to authorized officers (SMS + email + in-app) and citizen (WhatsApp)',
      officerCount: officers.length,
    })
    await recordAudit({
      action: 'AI_ANALYSIS_REPORT_SENT',
      entityId: incidentId,
      newState: `officers=${officers.length}`,
      reason: 'AI analysis report notification dispatched',
    })
  } catch (e: any) {
    console.error('[analysis-report] failed:', e)
  }
}
