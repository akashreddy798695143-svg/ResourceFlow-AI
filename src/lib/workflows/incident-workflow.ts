// Incident workflow — the automation pipeline that runs after INCIDENT_CREATED:
//   INCIDENT_CREATED → AI analysis → duplicate/clustering → risk calculation
//   → resource recommendation → approval request (AWAITING_APPROVAL)
// No manual button clicks required for internal steps.

import { db } from '@/lib/db'
import { recordIncidentEvent, recordAudit, broadcastStatusUpdate } from '@/lib/events'
import { analyzeIncident } from '@/lib/agents/incident-agent'
import { recommendResource } from '@/lib/agents/resource-agent'
import { calculateRisk } from '@/lib/services/risk-service'
import { getWeatherCached } from '@/lib/services/weather-service'
import { clusterIncident } from '@/lib/services/clustering-service'
import { pushNotification } from '@/lib/notifications'
import { sendResolutionEmails } from '@/lib/workflows/email-workflow'
import { sendAnalysisReport } from '@/lib/services/analysis-report-service'
import { dispatchNotification, getUserRecipient, getUsersByRole } from '@/lib/services/notification-service'
import { renderIncidentEventEmail, renderCitizenIncidentEmail } from '@/lib/services/email-templates'
import type { NotificationType } from '@prisma/client'

// Helper: create a notification targeted to the citizen who reported the incident.
async function notifyCitizen(incidentId: string, type: NotificationType, message: string) {
  const inc = await db.incident.findUnique({ where: { id: incidentId }, select: { reportedById: true } })
  if (!inc) return
  await pushNotification({ type, message, entityId: incidentId, userId: inc.reportedById })
}

// Helper: dispatch a multi-channel (SMS + email + in-app) notification for an incident event.
// If officerOnly=true, only officers/admins receive it (citizens NEVER see internal info).
// If officerOnly=false, BOTH the citizen who reported AND officers are notified — but the
// citizen receives a public-safe message via renderCitizenIncidentEmail, while officers
// receive the officer-oriented emailSubject/emailHtml.
async function dispatchIncidentEventNotification(
  incidentId: string,
  type: 'INCIDENT_CREATED' | 'INCIDENT_PRIORITY_CHANGED' | 'APPROVAL_REQUIRED' | 'RESOURCE_ASSIGNED' | 'RESOURCE_REASSIGNED' | 'RESPONSE_DELAYED' | 'INCIDENT_ESCALATED' | 'INCIDENT_RESOLVED' | 'REPORT_GENERATED' | 'ASSIGNMENT_CHANGED',
  content: {
    title: string
    message: string  // SMS-friendly short message
    emailSubject?: string
    emailHtml?: string  // officer/internal HTML
    officerOnly?: boolean
  }
) {
  try {
    const officers = await getUsersByRole(['DISASTER_OFFICER', 'ADMIN'])
    // Officer dispatch (officer-oriented email HTML)
    await dispatchNotification(type, officers, {
      title: content.title,
      message: content.message,
      emailSubject: content.emailSubject,
      emailHtml: content.emailHtml,
      incidentId,
    })
    // Citizen dispatch — only if not officerOnly, and with a public-safe email
    if (!content.officerOnly) {
      const incident = await db.incident.findUnique({ where: { id: incidentId }, include: { reportedBy: true } })
      if (incident?.reportedBy) {
        const citizenRecipient = await getUserRecipient(incident.reportedById)
        if (citizenRecipient) {
          // Build a public-safe email (no AI confidence, risk factors, resource details)
          const { html: citizenHtml, subject: citizenSubject } = renderCitizenIncidentEmail({
            incidentCode: incident.incidentCode,
            incidentType: incident.type.replace(/_/g, ' '),
            location: incident.location,
            status: incident.status,
            message: content.message,
            timestamp: new Date().toISOString(),
          })
          await dispatchNotification(type, [citizenRecipient], {
            title: content.title,
            message: content.message,
            emailSubject: citizenSubject,
            emailHtml: citizenHtml,
            incidentId,
          })
        }
      }
    }
  } catch (e) {
    console.error('[workflow] dispatchIncidentEventNotification failed:', e)
  }
}

// Citizen-friendly public messages keyed by incident status.
// These are the messages the citizen sees in their Track Incident view.
const PUBLIC_MESSAGES: Record<string, string> = {
  NEW: 'Your report has been received and is being processed.',
  ANALYZING: 'Our AI is analysing your report to understand the severity.',
  VERIFICATION: 'Your report is being verified and prioritised.',
  PRIORITIZED: 'Your report has been prioritised. A response team is being identified.',
  AWAITING_APPROVAL: 'A response team has been recommended. Awaiting officer approval.',
  ASSIGNED: 'A response team has been assigned to your incident.',
  IN_PROGRESS: 'A response team is working on your incident.',
  DELAYED: 'The response is delayed — the system is re-evaluating resources.',
  ESCALATED: 'Your incident has been escalated for priority handling.',
  RESOLVED: 'Your incident has been resolved.',
  CLOSED: 'Your incident has been closed.',
}
export function publicMessageFor(status: string): string {
  return PUBLIC_MESSAGES[status] || 'Status updated.'
}

export async function runIncidentWorkflow(incidentId: string) {
  const incident = await db.incident.findUnique({ where: { id: incidentId } })
  if (!incident) return

  try {
    // 1) AI analysis
    await db.incident.update({ where: { id: incidentId }, data: { status: 'ANALYZING' } })
    await recordIncidentEvent(incidentId, 'INCIDENT_ANALYZING', { label: 'AI analysis started' })

    const analysis = await analyzeIncident({
      description: incident.description,
      incidentType: incident.type,
      location: incident.location,
      language: incident.language,  // pass the citizen's stated language as a hint
      imageMeta: incident.imageMeta ? JSON.parse(incident.imageMeta) : null,
    })

    await db.incident.update({
      where: { id: incidentId },
      data: {
        aiSeverity: analysis.severity,
        aiPeopleAffected: analysis.people_affected_estimate,
        aiUrgentNeeds: JSON.stringify(analysis.urgent_needs),
        aiRoadBlocked: analysis.road_blocked,
        aiInfrastructureDamage: JSON.stringify(analysis.infrastructure_damage),
        aiRiskFactors: JSON.stringify(analysis.risk_factors),
        aiConfidence: analysis.confidence,
        aiMissingInfo: JSON.stringify(analysis.missing_information),
        aiAvailable: analysis.source === 'ai',
        // If the AI detected a language and the incident didn't have one, store it
        language: incident.language || analysis.detected_language || null,
        status: 'VERIFICATION',
      },
    })

    await db.aIRecommendation.create({
      data: {
        incidentId,
        recType: 'INCIDENT_ANALYSIS',
        payload: JSON.stringify(analysis),
        source: analysis.source,
      },
    })
    await recordIncidentEvent(incidentId, 'INCIDENT_ANALYZED', {
      label: analysis.source === 'ai' ? `AI analysis complete — severity ${analysis.severity}` : 'Fallback analysis (AI unavailable)',
      severity: analysis.severity,
      peopleAffected: analysis.people_affected_estimate,
      confidence: analysis.confidence,
      source: analysis.source,
    })
    await recordAudit({
      action: 'AI_ANALYSIS',
      entityId: incidentId,
      newState: `severity=${analysis.severity}, source=${analysis.source}`,
      reason: 'AI incident analysis',
    })
    // Dispatch the AI analysis report to authorized officers (SMS summary + full HTML email)
    // Internal officer-only information (AI confidence, risk factors, recommended resources)
    // is NEVER sent to citizens.
    await sendAnalysisReport(incidentId).catch((e) => console.error('[workflow] analysis report failed:', e))

    // 2) Duplicate detection + clustering
    const updated = await db.incident.findUnique({ where: { id: incidentId } })
    const cluster = await clusterIncident(updated!)
    await recordIncidentEvent(incidentId, 'INCIDENT_CLUSTERED', {
      label: cluster.clusterId ? `Clustered into ${cluster.clusterCode} (${cluster.clusterSize} reports)` : 'Standalone incident',
      clusterSize: cluster.clusterSize,
      clusterCode: cluster.clusterCode,
      confidence: cluster.confidence,
    })

    // 3) Weather context (optional, supporting)
    const weather = await getWeatherCached(incident.latitude, incident.longitude)

    // 4) Risk calculation
    const clusterSize = cluster.clusterSize
    const availableResources = await db.resource.count({ where: { status: 'AVAILABLE' } })
    const risk = calculateRisk({
      incidentType: incident.type,
      severity: analysis.severity,
      peopleAffected: analysis.people_affected_estimate,
      roadBlocked: analysis.road_blocked,
      infrastructureDamage: analysis.infrastructure_damage,
      clusterSize,
      availableResourcesNearby: availableResources,
      weather: weather ? { precipitation: weather.precipitation, wind: weather.wind, temperature: weather.temperature } : null,
      createdAt: incident.createdAt,
    })
    await db.incident.update({
      where: { id: incidentId },
      data: {
        status: 'PRIORITIZED',
        riskScore: risk.score,
        riskLevel: risk.level,
        riskReasons: JSON.stringify(risk.reasons),
        weather: weather ? JSON.stringify(weather) : null,
      },
    })
    await recordIncidentEvent(incidentId, 'RISK_CALCULATED', {
      label: `Risk ${risk.score}/100 (${risk.level}) — ${risk.reasons.slice(0, 2).join('; ')}`,
      score: risk.score,
      level: risk.level,
      reasons: risk.reasons,
    })
    await recordAudit({
      action: 'RISK_CALCULATED',
      entityId: incidentId,
      newState: `score=${risk.score}, level=${risk.level}`,
      reason: 'Prototype decision-support score',
    })

    // 5) Resource optimization
    const refreshed = await db.incident.findUnique({ where: { id: incidentId } })
    const resources = await db.resource.findMany()
    const rec = await recommendResource(
      {
        id: refreshed!.id,
        type: refreshed!.type,
        latitude: refreshed!.latitude,
        longitude: refreshed!.longitude,
        aiSeverity: refreshed!.aiSeverity,
        aiPeopleAffected: refreshed!.aiPeopleAffected,
        aiRoadBlocked: refreshed!.aiRoadBlocked,
      },
      resources
    )
    await db.aIRecommendation.create({
      data: {
        incidentId,
        recType: 'RESOURCE_OPTIMIZATION',
        payload: JSON.stringify(rec),
        source: rec.source,
      },
    })
    await recordIncidentEvent(incidentId, 'RESOURCE_RECOMMENDED', {
      label: rec.recommended_resource
        ? `Recommended ${rec.recommended_resource.code} (${rec.recommended_resource.name}) — ETA ${rec.recommended_resource.eta_minutes}min`
        : 'No eligible resource — escalation needed',
      recommended: rec.recommended_resource,
      alternatives: rec.alternative_resources,
      source: rec.source,
    })
    await recordAudit({
      action: 'RESOURCE_RECOMMENDED',
      entityId: incidentId,
      newState: rec.recommended_resource ? rec.recommended_resource.code : 'none',
      reason: rec.reason,
    })

    // 6) Create approval request (HUMAN APPROVAL — AI never auto-assigns high-impact)
    if (rec.recommended_resource) {
      await db.approval.create({
        data: {
          incidentId,
          resourceId: rec.recommended_resource.id,
          recommendation: JSON.stringify(rec),
          decision: 'PENDING',
        },
      })
      await db.incident.update({ where: { id: incidentId }, data: { status: 'AWAITING_APPROVAL' } })
      await recordIncidentEvent(incidentId, 'APPROVAL_REQUIRED', {
        label: `Officer approval required for ${rec.recommended_resource.code}`,
        resourceId: rec.recommended_resource.id,
      })
      await broadcastStatusUpdate({
        incidentId,
        incidentCode: incident.incidentCode,
        status: 'AWAITING_APPROVAL',
        publicMessage: publicMessageFor('AWAITING_APPROVAL'),
        previousStatus: 'PRIORITIZED',
      })
      await notifyCitizen(incidentId, 'INFO', publicMessageFor('AWAITING_APPROVAL'))
      await pushNotification({
        type: 'APPROVAL_REQUIRED',
        message: `Approval required for ${incident.incidentCode}: assign ${rec.recommended_resource.code} (${rec.recommended_resource.name}) — ETA ${rec.recommended_resource.eta_minutes}min`,
        entityId: incidentId,
      })
      // Multi-channel: SMS + email + in-app to all officers (APPROVAL_REQUIRED is critical)
      await dispatchIncidentEventNotification(incidentId, 'APPROVAL_REQUIRED', {
        title: `Approval Required: ${incident.incidentCode}`,
        message: `${incident.type.replace(/_/g, ' ')} at ${incident.location} — recommend ${rec.recommended_resource.code}, ETA ${rec.recommended_resource.eta_minutes}min. Officer approval needed.`,
        emailSubject: `RESOURCEFLOW AI – Approval Required: ${incident.incidentCode}`,
        emailHtml: renderIncidentEventEmail({
          incidentCode: incident.incidentCode,
          incidentType: incident.type.replace(/_/g, ' '),
          location: incident.location,
          status: 'AWAITING_APPROVAL',
          riskLevel: incident.riskLevel,
          riskScore: incident.riskScore,
          timestamp: new Date().toISOString(),
          actionRequired: `Approve resource ${rec.recommended_resource.code} (${rec.recommended_resource.name})`,
          additionalContext: `Recommended ETA: ${rec.recommended_resource.eta_minutes} min · Distance: ${rec.recommended_resource.distance_km} km`,
        }, 'Approval Required').html,
        officerOnly: true,  // never send to citizens
      })
    } else {
      // No eligible resource → escalate immediately
      await escalateIncident(incidentId, 'No eligible resource available at recommendation time', 2)
    }
  } catch (e: any) {
    console.error('[workflow] incident pipeline failed:', e)
    await recordIncidentEvent(incidentId, 'WORKFLOW_ERROR', { label: `Pipeline error: ${e?.message ?? e}` })
  }
}

// ───────────────────────────────────────────────
// APPROVAL FLOW
// ───────────────────────────────────────────────
export async function approveAssignment(approvalId: string, reviewerId: string, reason: string) {
  const approval = await db.approval.findUnique({ where: { id: approvalId } })
  if (!approval || approval.decision !== 'PENDING') throw new Error('Approval not pending')
  await db.approval.update({
    where: { id: approvalId },
    data: { decision: 'APPROVED', reviewerId, reason, reviewedAt: new Date() },
  })
  if (approval.resourceId) {
    await assignResource(approval.incidentId, approval.resourceId, reviewerId, reason)
  }
  await recordAudit({
    userId: reviewerId,
    action: 'APPROVAL_GRANTED',
    entityId: approval.incidentId,
    newState: 'APPROVED',
    reason: reason || 'Officer approved AI recommendation',
  })
  await recordIncidentEvent(approval.incidentId, 'APPROVAL_GRANTED', { label: 'Officer approved assignment', reason })
}

export async function rejectAssignment(approvalId: string, reviewerId: string, reason: string) {
  const approval = await db.approval.findUnique({ where: { id: approvalId } })
  if (!approval || approval.decision !== 'PENDING') throw new Error('Approval not pending')
  await db.approval.update({
    where: { id: approvalId },
    data: { decision: 'REJECTED', reviewerId, reason, reviewedAt: new Date() },
  })
  await db.incident.update({ where: { id: approval.incidentId }, data: { status: 'PRIORITIZED' } })
  await recordIncidentEvent(approval.incidentId, 'APPROVAL_REJECTED', { label: 'Officer rejected assignment', reason })
  await recordAudit({
    userId: reviewerId,
    action: 'APPROVAL_REJECTED',
    entityId: approval.incidentId,
    newState: 'REJECTED',
    reason,
  })
  await pushNotification({
    type: 'WARNING',
    message: `Assignment rejected for incident ${approval.incidentId.slice(-6)}. Reason: ${reason}`,
    entityId: approval.incidentId,
  })
}

// ───────────────────────────────────────────────
// RESOURCE ASSIGNMENT + CONFLICT DETECTION
// ───────────────────────────────────────────────
export async function assignResource(incidentId: string, resourceId: string, assignedById?: string, reason?: string) {
  const [incident, resource] = await Promise.all([
    db.incident.findUnique({ where: { id: incidentId } }),
    db.resource.findUnique({ where: { id: resourceId } }),
  ])
  if (!incident) throw new Error('Incident not found')
  if (!resource) throw new Error('Resource not found')
  if (resource.status === 'UNAVAILABLE') {
    await pushNotification({
      type: 'CRITICAL',
      message: `Conflict: resource ${resource.resourceCode} is UNAVAILABLE. Re-evaluating.`,
      entityId: incidentId,
    })
    await recordIncidentEvent(incidentId, 'RESOURCE_CONFLICT', { label: `${resource.resourceCode} unavailable — re-evaluating` })
    await reassignIncident(incidentId, `Resource ${resource.resourceCode} unavailable`, resourceId)
    return
  }
  const existingActive = await db.resourceAssignment.findFirst({
    where: { resourceId, status: 'ASSIGNED' },
  })
  if (existingActive && existingActive.incidentId !== incidentId) {
    await pushNotification({
      type: 'CRITICAL',
      message: `Conflict: ${resource.resourceCode} already assigned to another incident. Generating alternative recommendation.`,
      entityId: incidentId,
    })
    await recordIncidentEvent(incidentId, 'RESOURCE_CONFLICT', {
      label: `${resource.resourceCode} already assigned — generating alternative`,
      conflictingIncidentId: existingActive.incidentId,
    })
    await reassignIncident(incidentId, `Resource ${resource.resourceCode} already assigned to another incident`, resourceId)
    return
  }

  await db.resource.update({
    where: { id: resourceId },
    data: { status: 'ASSIGNED', lastUpdated: new Date() },
  })
  await db.resourceAssignment.create({
    data: { resourceId, incidentId, status: 'ASSIGNED', reason, assignedById },
  })
  await db.incident.update({
    where: { id: incidentId },
    data: {
      status: 'ASSIGNED',
      assignedResourceId: resourceId,
      assignedAt: new Date(),
    },
  })
  await recordIncidentEvent(incidentId, 'RESOURCE_ASSIGNED', {
    label: `Assigned ${resource.resourceCode} (${resource.name})`,
    resourceId,
    reason,
  })
  await recordAudit({
    userId: assignedById,
    action: 'RESOURCE_ASSIGNED',
    entityId: incidentId,
    newState: resource.resourceCode,
    reason: reason || 'Approved assignment',
  })
  // Citizen-facing: status is now ASSIGNED + targeted notification + realtime broadcast
  await broadcastStatusUpdate({
    incidentId,
    incidentCode: (await db.incident.findUnique({ where: { id: incidentId }, select: { incidentCode: true } }))?.incidentCode,
    status: 'ASSIGNED',
    publicMessage: publicMessageFor('ASSIGNED'),
    previousStatus: 'AWAITING_APPROVAL',
  })
  await notifyCitizen(incidentId, 'INFO', publicMessageFor('ASSIGNED'))
  // Officer-facing: keep the existing broadcast notification for officers/responders
  await pushNotification({
    type: 'INFO',
    message: `Resource ${resource.resourceCode} assigned to incident. Awaiting acknowledgement.`,
    entityId: incidentId,
  })
  // Multi-channel: RESOURCE_ASSIGNED notification to citizen (public-safe) + officers (internal)
  await dispatchIncidentEventNotification(incidentId, 'RESOURCE_ASSIGNED', {
    title: `Resource Assigned: ${incident.incidentCode}`,
    message: `${resource.resourceCode} (${resource.name}) assigned to ${incident.type.replace(/_/g, ' ')} at ${incident.location}. ETA ${resource.eta ?? '?'} min.`,
    emailSubject: `RESOURCEFLOW AI – Resource Assigned: ${incident.incidentCode}`,
    emailHtml: renderIncidentEventEmail({
      incidentCode: incident.incidentCode,
      incidentType: incident.type.replace(/_/g, ' '),
      location: incident.location,
      status: 'ASSIGNED',
      riskLevel: incident.riskLevel,
      riskScore: incident.riskScore,
      timestamp: new Date().toISOString(),
      actionRequired: `Acknowledge assignment of ${resource.resourceCode} (${resource.name})`,
    }, 'Resource Assigned').html,
    officerOnly: false,  // citizen gets public-safe email; officers get internal
  })
}

// ───────────────────────────────────────────────
// ADAPTIVE REASSIGNMENT
// ───────────────────────────────────────────────
export async function reassignIncident(incidentId: string, reason: string, excludeResourceId?: string) {
  const incident = await db.incident.findUnique({ where: { id: incidentId } })
  if (!incident) return
  // mark old assignment REPLACED (audit kept)
  if (excludeResourceId) {
    await db.resourceAssignment.updateMany({
      where: { incidentId, resourceId: excludeResourceId, status: 'ASSIGNED' },
      data: { status: 'REPLACED', replacedAt: new Date() },
    })
    await db.resource.update({ where: { id: excludeResourceId }, data: { status: 'AVAILABLE', lastUpdated: new Date() } })
  } else if (incident.assignedResourceId) {
    await db.resourceAssignment.updateMany({
      where: { incidentId, resourceId: incident.assignedResourceId, status: 'ASSIGNED' },
      data: { status: 'REPLACED', replacedAt: new Date() },
    })
  }
  await db.incident.update({
    where: { id: incidentId },
    data: { status: 'PRIORITIZED', assignedResourceId: null, assignedAt: null },
  })
  await recordIncidentEvent(incidentId, 'REASSIGNMENT', { label: `Reassignment triggered — ${reason}`, reason })
  await recordAudit({
    action: 'REASSIGNMENT',
    entityId: incidentId,
    reason,
  })
  await broadcastStatusUpdate({ incidentId, incidentCode: incident.incidentCode, status: 'PRIORITIZED', publicMessage: 'The assigned resource is no longer available. The system is finding an alternative response team.', previousStatus: incident.status })
  await notifyCitizen(incidentId, 'WARNING', 'The assigned resource is no longer available. The system is finding an alternative response team.')
  // Re-run resource recommendation
  const resources = await db.resource.findMany({
    where: { id: excludeResourceId ? { not: excludeResourceId } : undefined },
  })
  const rec = await recommendResource(
    {
      id: incident.id,
      type: incident.type,
      latitude: incident.latitude,
      longitude: incident.longitude,
      aiSeverity: incident.aiSeverity,
      aiPeopleAffected: incident.aiPeopleAffected,
      aiRoadBlocked: incident.aiRoadBlocked,
    },
    resources
  )
  await db.aIRecommendation.create({
    data: { incidentId, recType: 'REASSIGNMENT', payload: JSON.stringify(rec), source: rec.source },
  })
  await recordIncidentEvent(incidentId, 'RESOURCE_RECOMMENDED', {
    label: rec.recommended_resource
      ? `Alternative recommended: ${rec.recommended_resource.code} — ETA ${rec.recommended_resource.eta_minutes}min`
      : 'No alternative available — escalation needed',
    recommended: rec.recommended_resource,
    alternatives: rec.alternative_resources,
  })
  if (rec.recommended_resource) {
    await db.approval.create({
      data: {
        incidentId,
        resourceId: rec.recommended_resource.id,
        recommendation: JSON.stringify(rec),
        decision: 'PENDING',
      },
    })
    await db.incident.update({ where: { id: incidentId }, data: { status: 'AWAITING_APPROVAL' } })
    await recordIncidentEvent(incidentId, 'APPROVAL_REQUIRED', {
      label: `Alternative approval required for ${rec.recommended_resource.code}`,
      resourceId: rec.recommended_resource.id,
    })
    await broadcastStatusUpdate({ incidentId, incidentCode: incident.incidentCode, status: 'AWAITING_APPROVAL', publicMessage: 'An alternative response team has been identified. Awaiting officer approval.', previousStatus: 'PRIORITIZED' })
    await notifyCitizen(incidentId, 'INFO', 'An alternative response team has been identified. Awaiting officer approval.')
    await pushNotification({
      type: 'APPROVAL_REQUIRED',
      message: `Reassignment: approve ${rec.recommended_resource.code} for incident ${incident.incidentCode}`,
      entityId: incidentId,
    })
  } else {
    await escalateIncident(incidentId, 'No alternative resource available', 2)
  }
}

// ───────────────────────────────────────────────
// ESCALATION
// ───────────────────────────────────────────────
export async function escalateIncident(incidentId: string, reason: string, level: number) {
  const incident = await db.incident.findUnique({ where: { id: incidentId } })
  if (!incident) return
  const previousStatus = incident.status
  const newLevel = Math.max(incident.escalationLevel, level)
  await db.incident.update({
    where: { id: incidentId },
    data: { escalationLevel: newLevel, status: 'ESCALATED' },
  })
  await recordIncidentEvent(incidentId, 'INCIDENT_ESCALATED', {
    label: `Escalated to LEVEL ${newLevel} — ${reason}`,
    level: newLevel,
    reason,
  })
  await recordAudit({ action: 'ESCALATION', entityId: incidentId, newState: `LEVEL ${newLevel}`, reason })
  await broadcastStatusUpdate({ incidentId, incidentCode: incident.incidentCode, status: 'ESCALATED', publicMessage: publicMessageFor('ESCALATED'), previousStatus })
  await notifyCitizen(incidentId, 'ESCALATION', publicMessageFor('ESCALATED'))
  await pushNotification({
    type: 'ESCALATION',
    message: `Incident ${incident.incidentCode} escalated to LEVEL ${newLevel}. Reason: ${reason}`,
    entityId: incidentId,
  })
  // Multi-channel: ESCALATION is critical → SMS + email + in-app to officers (officer-only) + citizen (public-safe)
  await dispatchIncidentEventNotification(incidentId, 'INCIDENT_ESCALATED', {
    title: `ESCALATED LEVEL ${newLevel}: ${incident.incidentCode}`,
    message: `Escalated to LEVEL ${newLevel}. ${reason}. ${incident.type.replace(/_/g, ' ')} at ${incident.location}.`,
    emailSubject: `RESOURCEFLOW AI – Incident Escalated: ${incident.incidentCode} (L${newLevel})`,
    emailHtml: renderIncidentEventEmail({
      incidentCode: incident.incidentCode,
      incidentType: incident.type.replace(/_/g, ' '),
      location: incident.location,
      status: 'ESCALATED',
      riskLevel: incident.riskLevel,
      riskScore: incident.riskScore,
      timestamp: new Date().toISOString(),
      actionRequired: `Review escalation — LEVEL ${newLevel}. Reason: ${reason}`,
    }, 'Incident Escalated').html,
    officerOnly: false,  // citizen gets public-safe escalation notice; officers get internal
  })
}

// ───────────────────────────────────────────────
// RESPONSE TRACKING + DELAY DETECTION
// ───────────────────────────────────────────────
const ACK_THRESHOLD_MIN = 5
const ARRIVE_THRESHOLD_MIN = 20
const RESOLVE_THRESHOLD_MIN = 60

export async function advanceResponse(incidentId: string, stage: 'ACK' | 'START' | 'ARRIVE' | 'RESOLVE', byUserId?: string) {
  const incident = await db.incident.findUnique({ where: { id: incidentId } })
  if (!incident) throw new Error('Incident not found')
  const now = new Date()
  if (stage === 'ACK' && !incident.acknowledgedAt) {
    await db.incident.update({ where: { id: incidentId }, data: { acknowledgedAt: now, status: 'IN_PROGRESS' } })
    await recordIncidentEvent(incidentId, 'RESPONSE_ACKNOWLEDGED', { label: 'Responder acknowledged assignment' })
    await broadcastStatusUpdate({ incidentId, incidentCode: incident.incidentCode, status: 'IN_PROGRESS', publicMessage: 'Your response team has acknowledged the assignment and is preparing to depart.', previousStatus: incident.status })
    await notifyCitizen(incidentId, 'INFO', 'Your response team has acknowledged the assignment and is preparing to depart.')
    await dispatchIncidentEventNotification(incidentId, 'ASSIGNMENT_CHANGED', {
      title: `Responder Acknowledged: ${incident.incidentCode}`,
      message: `Response team acknowledged assignment for ${incident.type.replace(/_/g, ' ')} at ${incident.location}.`,
      emailSubject: `RESOURCEFLOW AI – Responder Acknowledged: ${incident.incidentCode}`,
      emailHtml: renderIncidentEventEmail({
        incidentCode: incident.incidentCode,
        incidentType: incident.type.replace(/_/g, ' '),
        location: incident.location,
        status: 'IN_PROGRESS',
        riskLevel: incident.riskLevel,
        riskScore: incident.riskScore,
        timestamp: now.toISOString(),
        actionRequired: 'Responder acknowledged assignment — preparing departure',
      }, 'Responder Acknowledged').html,
      officerOnly: false,
    })
  } else if (stage === 'START' && !incident.startedAt) {
    await db.incident.update({ where: { id: incidentId }, data: { startedAt: now, status: 'IN_PROGRESS' } })
    if (incident.assignedResourceId) {
      await db.resource.update({ where: { id: incident.assignedResourceId }, data: { status: 'EN_ROUTE', lastUpdated: now } })
    }
    await recordIncidentEvent(incidentId, 'RESPONSE_STARTED', { label: 'Responder en route' })
    await broadcastStatusUpdate({ incidentId, incidentCode: incident.incidentCode, status: 'IN_PROGRESS', publicMessage: 'Your response team is en route to the incident.', previousStatus: incident.status })
    await notifyCitizen(incidentId, 'INFO', 'Your response team is en route to the incident.')
    await dispatchIncidentEventNotification(incidentId, 'ASSIGNMENT_CHANGED', {
      title: `Responder En Route: ${incident.incidentCode}`,
      message: `Response team is en route to ${incident.type.replace(/_/g, ' ')} at ${incident.location}.`,
      emailSubject: `RESOURCEFLOW AI – Responder En Route: ${incident.incidentCode}`,
      emailHtml: renderIncidentEventEmail({
        incidentCode: incident.incidentCode,
        incidentType: incident.type.replace(/_/g, ' '),
        location: incident.location,
        status: 'IN_PROGRESS',
        riskLevel: incident.riskLevel,
        riskScore: incident.riskScore,
        timestamp: now.toISOString(),
        actionRequired: 'Response team en route to scene coordinates',
      }, 'Responder En Route').html,
      officerOnly: false,
    })
  } else if (stage === 'ARRIVE' && !incident.arrivedAt) {
    await db.incident.update({ where: { id: incidentId }, data: { arrivedAt: now, status: 'IN_PROGRESS' } })
    if (incident.assignedResourceId) {
      await db.resource.update({ where: { id: incident.assignedResourceId }, data: { status: 'ON_SCENE', lastUpdated: now } })
    }
    await recordIncidentEvent(incidentId, 'RESPONSE_ARRIVED', { label: 'Responder on scene' })
    await broadcastStatusUpdate({ incidentId, incidentCode: incident.incidentCode, status: 'IN_PROGRESS', publicMessage: 'Your response team has arrived on scene. Work is in progress.', previousStatus: incident.status })
    await notifyCitizen(incidentId, 'INFO', 'Your response team has arrived on scene. Work is in progress.')
    await dispatchIncidentEventNotification(incidentId, 'ASSIGNMENT_CHANGED', {
      title: `Responder On Scene: ${incident.incidentCode}`,
      message: `Response team has arrived on scene for ${incident.type.replace(/_/g, ' ')} at ${incident.location}.`,
      emailSubject: `RESOURCEFLOW AI – Responder On Scene: ${incident.incidentCode}`,
      emailHtml: renderIncidentEventEmail({
        incidentCode: incident.incidentCode,
        incidentType: incident.type.replace(/_/g, ' '),
        location: incident.location,
        status: 'IN_PROGRESS',
        riskLevel: incident.riskLevel,
        riskScore: incident.riskScore,
        timestamp: now.toISOString(),
        actionRequired: 'Responder team on scene — active emergency operations underway',
      }, 'Responder On Scene').html,
      officerOnly: false,
    })
  } else if (stage === 'RESOLVE') {
    await resolveIncident(incidentId, byUserId)
  }
}

export async function resolveIncident(incidentId: string, byUserId?: string) {
  const incident = await db.incident.findUnique({ where: { id: incidentId } })
  if (!incident) throw new Error('Incident not found')
  const now = new Date()
  await db.incident.update({
    where: { id: incidentId },
    data: { status: 'RESOLVED', resolvedAt: now },
  })
  if (incident.assignedResourceId) {
    await db.resource.update({
      where: { id: incident.assignedResourceId },
      data: { status: 'AVAILABLE', lastUpdated: now },
    })
    // Mark the assignment as COMPLETED (not ASSIGNED) so it no longer triggers
    // conflict detection for future incidents that might use the same resource.
    await db.resourceAssignment.updateMany({
      where: { incidentId, resourceId: incident.assignedResourceId, status: 'ASSIGNED' },
      data: { status: 'COMPLETED' },
    })
  }
  await recordIncidentEvent(incidentId, 'INCIDENT_RESOLVED', { label: 'Incident resolved' })
  await recordAudit({ userId: byUserId, action: 'INCIDENT_RESOLVED', entityId: incidentId, newState: 'RESOLVED' })
  await broadcastStatusUpdate({ incidentId, incidentCode: incident.incidentCode, status: 'RESOLVED', publicMessage: publicMessageFor('RESOLVED'), previousStatus: incident.status })
  await notifyCitizen(incidentId, 'RESOLUTION', publicMessageFor('RESOLVED'))
  await pushNotification({ type: 'RESOLUTION', message: `Incident ${incident.incidentCode} resolved.`, entityId: incidentId })
  await generateIncidentReport(incidentId)
  // Multi-channel: INCIDENT_RESOLVED notification (citizen gets public-safe, officers get internal)
  await dispatchIncidentEventNotification(incidentId, 'INCIDENT_RESOLVED', {
    title: `Incident Resolved: ${incident.incidentCode}`,
    message: `${incident.type.replace(/_/g, ' ')} at ${incident.location} has been resolved.`,
    emailSubject: `RESOURCEFLOW AI – Incident Resolved: ${incident.incidentCode}`,
    emailHtml: renderIncidentEventEmail({
      incidentCode: incident.incidentCode,
      incidentType: incident.type.replace(/_/g, ' '),
      location: incident.location,
      status: 'RESOLVED',
      riskLevel: incident.riskLevel,
      riskScore: incident.riskScore,
      timestamp: now.toISOString(),
    }, 'Incident Resolved').html,
    officerOnly: false,
  })
  // Automated resolution email — runs after the report is generated.
  // Idempotent (incident.resolutionEmailSent guard). Failures never roll back resolution.
  await sendResolutionEmails(incidentId, byUserId)
}

// Generate an automatic incident report after resolution
export async function generateIncidentReport(incidentId: string) {
  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: {
      events: { orderBy: { createdAt: 'asc' } },
      assignments: { include: { resource: true } },
      approvals: { include: { reviewer: { select: { name: true, email: true } } } },
    },
  })
  if (!incident) return

  const totalTimeMin = incident.resolvedAt
    ? Math.max(1, Math.round((incident.resolvedAt.getTime() - incident.createdAt.getTime()) / 60000))
    : 0

  const responseTimeMin = incident.acknowledgedAt && incident.assignedAt
    ? Math.max(1, Math.round((incident.acknowledgedAt.getTime() - incident.assignedAt.getTime()) / 60000))
    : null

  const notifCount = await db.notificationLog.count({ where: { incidentId } })

  const report = {
    incidentCode: incident.incidentCode,
    type: incident.type,
    description: incident.description,
    location: incident.location,
    coordinates: { lat: incident.latitude, lng: incident.longitude },
    aiSeverity: incident.aiSeverity,
    aiPeopleAffected: incident.aiPeopleAffected,
    riskScore: incident.riskScore,
    riskLevel: incident.riskLevel,
    summary: `${incident.type.replace(/_/g, ' ')} incident resolved in ${totalTimeMin} minutes with response team deployment.`,
    timeline: incident.events.map((e) => {
      let d: any = {}
      try { d = JSON.parse(e.data) } catch {}
      return { t: e.createdAt, type: e.eventType, label: d?.label || e.eventType }
    }),
    resourcesDeployed: incident.assignments.map((a) => ({
      resourceCode: a.resource.resourceCode,
      name: a.resource.name,
      type: a.resource.type,
      status: a.status,
      assignedAt: a.assignedAt,
    })),
    approvals: incident.approvals.map((ap) => ({
      decision: ap.decision,
      reviewedBy: ap.reviewer?.name || 'Authorized Officer',
      reviewedAt: ap.reviewedAt,
      reason: ap.reason,
    })),
    responseTimeMin,
    resolutionTimeMin: totalTimeMin,
    delays: incident.events.filter((e) => e.eventType === 'RESPONSE_DELAYED').length,
    escalationLevel: incident.escalationLevel,
    notificationsDispatched: notifCount,
    finalOutcome: 'Scene stabilized — incident resolved successfully',
    generatedAt: new Date().toISOString(),
  }
  await db.generatedReport.upsert({
    where: { incidentId },
    create: { incidentId, content: JSON.stringify(report) },
    update: { content: JSON.stringify(report) },
  })
  await recordIncidentEvent(incidentId, 'REPORT_GENERATED', { label: 'Automatic incident report generated' })
}

// Periodic delay detection — call from a cron-ish endpoint
export async function detectDelays() {
  const active = await db.incident.findMany({
    where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
  })
  const now = Date.now()
  for (const inc of active) {
    if (!inc.assignedAt) continue
    const sinceAssignedMin = (now - inc.assignedAt.getTime()) / 60000
    if (!inc.acknowledgedAt && sinceAssignedMin > ACK_THRESHOLD_MIN) {
      await markDelayed(inc.id, `No acknowledgement after ${Math.round(sinceAssignedMin)} min`)
    } else if (inc.acknowledgedAt && !inc.arrivedAt && (now - inc.acknowledgedAt.getTime()) / 60000 > ARRIVE_THRESHOLD_MIN) {
      await markDelayed(inc.id, `No arrival after ${Math.round((now - inc.acknowledgedAt.getTime()) / 60000)} min en route`)
    } else if (inc.arrivedAt && !inc.resolvedAt && (now - inc.arrivedAt.getTime()) / 60000 > RESOLVE_THRESHOLD_MIN) {
      await markDelayed(inc.id, `Resolution overdue after ${Math.round((now - inc.arrivedAt.getTime()) / 60000)} min on scene`)
    }
  }
}

async function markDelayed(incidentId: string, reason: string) {
  const inc = await db.incident.findUnique({ where: { id: incidentId } })
  if (!inc) return
  if (inc.status === 'DELAYED' || inc.status === 'ESCALATED') return
  const previousStatus = inc.status
  await db.incident.update({ where: { id: incidentId }, data: { status: 'DELAYED' } })
  await recordIncidentEvent(incidentId, 'RESPONSE_DELAYED', { label: `Response delayed — ${reason}`, reason })
  await recordAudit({ action: 'RESPONSE_DELAYED', entityId: incidentId, reason })
  await broadcastStatusUpdate({ incidentId, incidentCode: inc.incidentCode, status: 'DELAYED', publicMessage: publicMessageFor('DELAYED'), previousStatus })
  await notifyCitizen(incidentId, 'WARNING', publicMessageFor('DELAYED'))
  await pushNotification({ type: 'CRITICAL', message: `Delayed: ${reason} (incident ${inc.incidentCode})`, entityId: incidentId })
  // Multi-channel: RESPONSE_DELAYED is critical → SMS + email + in-app
  await dispatchIncidentEventNotification(incidentId, 'RESPONSE_DELAYED', {
    title: `Response Delayed: ${inc.incidentCode}`,
    message: `${reason}. ${inc.type.replace(/_/g, ' ')} at ${inc.location}. Re-evaluating resources.`,
    emailSubject: `RESOURCEFLOW AI – Response Delayed: ${inc.incidentCode}`,
    emailHtml: renderIncidentEventEmail({
      incidentCode: inc.incidentCode,
      incidentType: inc.type.replace(/_/g, ' '),
      location: inc.location,
      status: 'DELAYED',
      riskLevel: inc.riskLevel,
      riskScore: inc.riskScore,
      timestamp: new Date().toISOString(),
      actionRequired: `Review delay — ${reason}`,
    }, 'Response Delayed').html,
    officerOnly: false,
  })
  // Auto-escalate at level 2 if delay persists
  await escalateIncident(incidentId, `Auto-escalation: ${reason}`, 2)
}

// When a resource becomes unavailable while assigned → adaptive reassignment
export async function handleResourceUnavailable(resourceId: string, reason: string) {
  const resource = await db.resource.findUnique({ where: { id: resourceId } })
  if (!resource) return
  await db.resource.update({ where: { id: resourceId }, data: { status: 'UNAVAILABLE', lastUpdated: new Date() } })
  await recordAudit({ action: 'RESOURCE_UNAVAILABLE', entityId: resourceId, reason })
  await pushNotification({ type: 'CRITICAL', message: `Resource ${resource.resourceCode} unavailable: ${reason}`, entityId: resourceId })
  // Find any active incident assigned to this resource and trigger reassignment
  const assignments = await db.resourceAssignment.findMany({
    where: { resourceId, status: 'ASSIGNED' },
  })
  for (const a of assignments) {
    await recordIncidentEvent(a.incidentId, 'RESOURCE_UNAVAILABLE', {
      label: `${resource.resourceCode} became unavailable — ${reason}`,
      resourceId,
    })
    await reassignIncident(a.incidentId, `Assigned resource ${resource.resourceCode} unavailable: ${reason}`, resourceId)
  }
}

// Force a road-blockage re-evaluation trigger (used by simulation/manual)
export async function triggerReevaluation(incidentId: string, reason: string) {
  await recordIncidentEvent(incidentId, 'CONDITION_CHANGED', { label: `Re-evaluation triggered — ${reason}` })
  await reassignIncident(incidentId, reason)
}

export { ACK_THRESHOLD_MIN, ARRIVE_THRESHOLD_MIN, RESOLVE_THRESHOLD_MIN }
