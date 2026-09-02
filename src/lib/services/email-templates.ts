// HTML email templates for incident resolution reports.
// Two variants: citizen (public-safe) and officer (internal/detailed).
// Both use the RESOURCEFLOW AI dark+amber branding.

export interface PublicReportData {
  incidentCode: string
  incidentType: string
  location: string
  status: string
  reportedAt: string
  resolvedAt: string
  responseTimeMin: number | null
  resolutionTimeMin: number | null
}

export interface OfficerReportData extends PublicReportData {
  description: string
  aiSeverity: string | null
  aiPeopleAffected: number | null
  aiUrgentNeeds: string[]
  aiRoadBlocked: boolean | null
  aiRiskFactors: string[]
  riskScore: number | null
  riskLevel: string | null
  riskReasons: string[]
  clusterCode: string | null
  clusterSize: number
  recommendedResources: Array<{ code: string; name: string; reason: string }>
  approvedResources: string[]
  assignmentHistory: Array<{ code: string; status: string; at: string }>
  responseTimeline: Array<{ label: string; at: string | null }>
  delays: number
  reassignments: number
  escalations: number
  resourceFailures: number
  finalOutcome: string
}

function fmtDate(iso: string | null): string {
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

function brandHeader(): string {
  return `
  <div style="background:linear-gradient(135deg,#1a1d23 0%,#0f1115 100%);padding:24px 28px;border-radius:8px 8px 0 0;border-bottom:3px solid #f59e0b">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;background:#f59e0b;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#1a1d23;font-weight:bold;font-size:18px">R</div>
      <div>
        <div style="color:#f5f5f5;font-size:18px;font-weight:bold;letter-spacing:0.5px">RESOURCEFLOW AI</div>
        <div style="color:#9ca3af;font-size:11px;letter-spacing:1px;text-transform:uppercase">Disaster Coordination Platform</div>
      </div>
    </div>
  </div>`
}

function footer(): string {
  return `
  <div style="background:#f9fafb;padding:18px 28px;border-radius:0 0 8px 8px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6">
    <p style="margin:0 0 8px 0">For your safety, please continue following instructions from authorized emergency personnel.</p>
    <p style="margin:0 0 4px 0"><strong>RESOURCEFLOW AI</strong> — Disaster Coordination Platform</p>
    <p style="margin:0;color:#9ca3af;font-size:11px">This is an automated message. Do not reply. Prototype decision-support score — not a medically or scientifically validated model.</p>
  </div>`
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    RESOLVED: '#22c55e',
    ASSIGNED: '#f59e0b',
    IN_PROGRESS: '#3b82f6',
  }
  const bg = colors[status] || '#6b7280'
  return `<span style="display:inline-block;background:${bg};color:white;font-size:11px;font-weight:bold;padding:3px 10px;border-radius:12px;letter-spacing:0.5px">${status.replace(/_/g, ' ')}</span>`
}

function field(label: string, value: string): string {
  return `
  <tr>
    <td style="padding:8px 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;width:40%;border-bottom:1px solid #f3f4f6">${label}</td>
    <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;border-bottom:1px solid #f3f4f6">${value}</td>
  </tr>`
}

// ─── CITIZEN (public-safe) ───────────────────────────────
export function renderCitizenReportEmail(data: PublicReportData): { subject: string; html: string } {
  const subject = `RESOURCEFLOW AI — Incident ${data.incidentCode} Resolved`
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:24px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    ${brandHeader()}
    <div style="padding:28px">
      <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.6">Hello,</p>
      <p style="margin:0 0 24px 0;color:#374151;font-size:15px;line-height:1.6">Your reported incident has been resolved.</p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-family:monospace;font-size:15px;font-weight:bold;color:#f59e0b">${data.incidentCode}</div>
          ${statusBadge(data.status)}
        </div>
        <table style="width:100%;border-collapse:collapse">
          ${field('Incident Type', data.incidentType)}
          ${field('Location', data.location)}
          ${field('Final Status', data.status.replace(/_/g, ' '))}
          ${field('Reported', fmtDate(data.reportedAt))}
          ${field('Resolved', fmtDate(data.resolvedAt))}
          ${field('Response Time', data.responseTimeMin != null ? `${data.responseTimeMin} minutes` : '—')}
          ${field('Resolution Time', data.resolutionTimeMin != null ? `${data.resolutionTimeMin} minutes` : '—')}
        </table>
      </div>

      <p style="margin:0 0 8px 0;color:#374151;font-size:14px;line-height:1.6">Thank you for using RESOURCEFLOW AI.</p>
    </div>
    ${footer()}
  </div>
</body></html>`
  return { subject, html }
}

// ─── OFFICER (internal/detailed) ───────────────────────
export function renderOfficerReportEmail(data: OfficerReportData): { subject: string; html: string } {
  const subject = `[INTERNAL] RESOURCEFLOW AI — Incident ${data.incidentCode} Resolution Report`
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:680px;margin:24px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    ${brandHeader()}
    <div style="padding:28px">
      <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px 14px;margin-bottom:20px;color:#92400e;font-size:12px;font-weight:500">
        INTERNAL — For authorized officers only. Do not forward to citizens.
      </div>

      <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.6">Incident resolution report for your review.</p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-family:monospace;font-size:15px;font-weight:bold;color:#f59e0b">${data.incidentCode}</div>
          ${statusBadge(data.status)}
        </div>
        <table style="width:100%;border-collapse:collapse">
          ${field('Incident Type', data.incidentType)}
          ${field('Location', data.location)}
          ${field('Reported', fmtDate(data.reportedAt))}
          ${field('Resolved', fmtDate(data.resolvedAt))}
          ${field('Response Time', data.responseTimeMin != null ? `${data.responseTimeMin} min` : '—')}
          ${field('Resolution Time', data.resolutionTimeMin != null ? `${data.resolutionTimeMin} min` : '—')}
          ${field('Final Outcome', data.finalOutcome)}
        </table>
      </div>

      <h3 style="color:#111827;font-size:14px;margin:20px 0 10px 0;border-bottom:2px solid #f59e0b;padding-bottom:6px">AI Analysis</h3>
      <table style="width:100%;border-collapse:collapse">
        ${field('AI Severity', data.aiSeverity || '—')}
        ${field('People Affected (est.)', data.aiPeopleAffected != null ? String(data.aiPeopleAffected) : '—')}
        ${field('Road Blocked', data.aiRoadBlocked == null ? '—' : data.aiRoadBlocked ? 'Yes' : 'No')}
        ${field('Urgent Needs', data.aiUrgentNeeds.length ? data.aiUrgentNeeds.join(', ') : '—')}
        ${field('Risk Factors', data.aiRiskFactors.length ? data.aiRiskFactors.join('; ') : '—')}
      </table>

      <h3 style="color:#111827;font-size:14px;margin:20px 0 10px 0;border-bottom:2px solid #f59e0b;padding-bottom:6px">Risk Assessment</h3>
      <table style="width:100%;border-collapse:collapse">
        ${field('Risk Score', data.riskScore != null ? `${data.riskScore}/100` : '—')}
        ${field('Risk Level', data.riskLevel || '—')}
        ${field('Risk Reasons', data.riskReasons.length ? data.riskReasons.join('; ') : '—')}
        ${field('Cluster', data.clusterCode ? `${data.clusterCode} (${data.clusterSize} reports)` : 'Standalone')}
      </table>

      <h3 style="color:#111827;font-size:14px;margin:20px 0 10px 0;border-bottom:2px solid #f59e0b;padding-bottom:6px">Resources & Assignments</h3>
      <table style="width:100%;border-collapse:collapse">
        ${field('Recommended', data.recommendedResources.length ? data.recommendedResources.map((r) => `${r.code} (${r.name})`).join(', ') : '—')}
        ${field('Approved', data.approvedResources.length ? data.approvedResources.join(', ') : '—')}
      </table>
      ${data.assignmentHistory.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;margin-top:10px">
        <tr style="background:#f3f4f6"><th style="text-align:left;padding:6px 8px;font-size:11px;color:#6b7280;text-transform:uppercase">Resource</th><th style="text-align:left;padding:6px 8px;font-size:11px;color:#6b7280;text-transform:uppercase">Status</th><th style="text-align:left;padding:6px 8px;font-size:11px;color:#6b7280;text-transform:uppercase">At</th></tr>
        ${data.assignmentHistory.map((a) => `<tr><td style="padding:6px 8px;font-family:monospace;font-size:12px">${a.code}</td><td style="padding:6px 8px;font-size:12px">${a.status}</td><td style="padding:6px 8px;font-size:12px;color:#6b7280">${fmtDate(a.at)}</td></tr>`).join('')}
      </table>` : ''}

      <h3 style="color:#111827;font-size:14px;margin:20px 0 10px 0;border-bottom:2px solid #f59e0b;padding-bottom:6px">Response Timeline</h3>
      <table style="width:100%;border-collapse:collapse">
        ${data.responseTimeline.map((t) => field(t.label, fmtDate(t.at))).join('')}
      </table>

      <h3 style="color:#111827;font-size:14px;margin:20px 0 10px 0;border-bottom:2px solid #f59e0b;padding-bottom:6px">Operational Events</h3>
      <table style="width:100%;border-collapse:collapse">
        ${field('Delays', String(data.delays))}
        ${field('Reassignments', String(data.reassignments))}
        ${field('Escalations', String(data.escalations))}
        ${field('Resource Failures', String(data.resourceFailures))}
      </table>

      <p style="margin:20px 0 0 0;color:#374151;font-size:14px;line-height:1.6">Full audit trail available in the dashboard.</p>
    </div>
    ${footer()}
  </div>
</body></html>`
  return { subject, html }
}
