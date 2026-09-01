// Hackathon Demo — runs the complete end-to-end workflow against the REAL backend.
// Creates a real flood incident (which triggers AI analysis → clustering → risk → resource rec → approval),
// then auto-approves the assignment, then simulates a road blockage + resource failure
// (which triggers adaptive reassignment + escalation), then resolves the incident.
// All actions are real backend calls, persisting to the real database + WebSocket broadcasts.

import { db } from '@/lib/db'
import { broadcastEvent, recordIncidentEvent } from '@/lib/events'
import { runIncidentWorkflow, approveAssignment, advanceResponse, handleResourceUnavailable, resolveIncident } from '@/lib/workflows/incident-workflow'
import { runSimulation } from '@/lib/services/simulation-service'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface DemoStep {
  step: number
  label: string
  status: 'done' | 'pending'
  incidentId?: string
  simRunId?: string
}

export async function runHackathonDemo(officerId: string): Promise<{
  incidentId: string
  incidentCode: string
  simRunId: string
  steps: DemoStep[]
}> {
  const steps: DemoStep[] = []
  const pushStep = (label: string, extra: Partial<DemoStep> = {}) => {
    const s = { step: steps.length + 1, label, status: 'done' as const, ...extra }
    steps.push(s)
    broadcastEvent({ type: 'DEMO_STEP', label: `Step ${s.step}: ${label}`, data: s })
    return s
  }

  // Use an officer-controlled citizen surrogate report (we create it as the officer; the workflow doesn't care).
  // Step 1: Citizen reports a flood
  const year = new Date().getFullYear()
  const count = await db.incident.count()
  const incidentCode = `RF-${year}-${String(count + 1).padStart(6, '0')}`
  const incident = await db.incident.create({
    data: {
      incidentCode,
      type: 'FLOOD',
      description: 'Severe flooding in Riverside District. Water rising rapidly, multiple families trapped on rooftops, roads impassable. Urgent evacuation and rescue boats needed.',
      location: 'Riverside District, Sector 7',
      latitude: 28.6139,
      longitude: 77.209,
      status: 'NEW',
      reportedById: officerId,
    },
  })
  await recordIncidentEvent(incident.id, 'INCIDENT_CREATED', { label: `${incident.incidentCode}: FLOOD reported at Riverside District`, code: incident.incidentCode, type: 'FLOOD' })
  await broadcastEvent({ type: 'INCIDENT_CREATED', label: `${incident.incidentCode} created (DEMO)`, incidentId: incident.id })
  pushStep('Citizen flood report submitted', { incidentId: incident.id })

  // Step 2-6: run the workflow pipeline
  await runIncidentWorkflow(incident.id)
  pushStep('AI analysis → clustering → risk → resource recommendation → approval request')

  await sleep(400) // give pipeline a moment

  // Step: Officer auto-approves (in demo mode the officer is the orchestrator)
  let approval = await db.approval.findFirst({ where: { incidentId: incident.id, decision: 'PENDING' }, orderBy: { createdAt: 'desc' } })
  if (approval) {
    await approveAssignment(approval.id, officerId, 'Demo auto-approval by orchestrator')
    pushStep('Officer approves resource assignment')
  }

  // Step: responder ACK
  await sleep(300)
  await advanceResponse(incident.id, 'ACK', officerId)
  pushStep('Responder acknowledges assignment')

  // Step: responder en route + on scene
  await sleep(200)
  await advanceResponse(incident.id, 'START', officerId)
  await advanceResponse(incident.id, 'ARRIVE', officerId)
  pushStep('Responder en route and on scene')

  // Step: Road blockage triggers adaptive re-evaluation
  await sleep(200)
  await recordIncidentEvent(incident.id, 'ROAD_BLOCKED', { label: 'Road blocked — NH-44 segment flooded', road: 'NH-44' })
  // Force a re-evaluation (treats the assigned resource as needing re-routing)
  const assignedResource = await db.incident.findUnique({ where: { id: incident.id }, select: { assignedResourceId: true } })
  if (assignedResource?.assignedResourceId) {
    await handleResourceUnavailable(assignedResource.assignedResourceId, 'Road blocked — resource rerouted as unavailable for re-optimization')
  }
  pushStep('Road blockage → adaptive response → alternative recommendation')

  // Step: approve the alternative resource
  await sleep(300)
  const altApproval = await db.approval.findFirst({ where: { incidentId: incident.id, decision: 'PENDING' }, orderBy: { createdAt: 'desc' } })
  if (altApproval) {
    await approveAssignment(altApproval.id, officerId, 'Demo: approved alternative resource after blockage')
    pushStep('Officer approves alternative resource')
  }

  // Step: Run the simulation (parallel — for baseline vs resourceflow comparison)
  await sleep(200)
  const simRun = await runSimulation({
    scenario: 'FLOOD',
    options: { roadBlocked: true, ambulanceUnavailable: true, responseDelay: true, additionalIncidents: true },
  })
  pushStep('Simulation run: BASELINE vs RESOURCEFLOW computed', { simRunId: simRun.id })

  // Step: resolve incident
  await sleep(200)
  await resolveIncident(incident.id, officerId)
  pushStep('Incident resolved — automatic report generated')

  return { incidentId: incident.id, incidentCode, simRunId: simRun.id, steps }
}
