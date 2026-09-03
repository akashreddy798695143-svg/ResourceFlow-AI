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
import { renderAnalysisReportEmail, renderIncidentEventEmail, type AnalysisReportData } from '@/lib/services/email-templates'
import { recordIncidentEvent, recordAudit } from '@/lib/events'
import { dispatchNotification, getUsersByRole, type NotificationType } from '@/lib/services/notification-service'

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

    await recordIncidentEvent(incidentId, 'AI_ANALYSIS_REPORT_SENT', {
      label: 'AI analysis report dispatched to authorized officers (SMS + email + in-app)',
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
