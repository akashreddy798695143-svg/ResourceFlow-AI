// Hackathon Demo Service — runs a complete end-to-end disaster workflow against the REAL backend.
// Supports Earthquake, Landslide, Road Blockage, and Flood scenarios.
// Complete workflow:
//   Citizen Report → Gemini AI Analysis → Risk Calculation → Resource Recommendation
//   → Officer Approval → Responder Assignment → Live Status (ACK → START → ARRIVE)
//   → Resolution → Automated Report → Multi-channel Notifications (WhatsApp/SMS/Email).

import { db } from '@/lib/db'
import { broadcastEvent, recordIncidentEvent } from '@/lib/events'
import {
  runIncidentWorkflow,
  approveAssignment,
  advanceResponse,
  handleResourceUnavailable,
  resolveIncident,
} from '@/lib/workflows/incident-workflow'
import { runSimulation } from '@/lib/services/simulation-service'
import type { IncidentType } from '@prisma/client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface DemoStep {
  step: number
  label: string
  status: 'done' | 'pending'
  incidentId?: string
  simRunId?: string
}

export type DemoScenarioType = 'EARTHQUAKE' | 'LANDSLIDE' | 'ROAD_BLOCKAGE' | 'FLOOD'

interface ScenarioConfig {
  type: IncidentType
  description: string
  location: string
  latitude: number
  longitude: number
  blockageNote: string
}

const SCENARIOS: Record<DemoScenarioType, ScenarioConfig> = {
  EARTHQUAKE: {
    type: 'EARTHQUAKE',
    description: 'Major 6.4 magnitude earthquake reported in Central Urban Corridor. Multiple multi-story buildings structurally compromised, masonry collapse, approximately 40 people trapped in basement levels. High risk of aftershocks and fractured gas feeds.',
    location: 'Central Civic District, Sector 4',
    latitude: 28.6145,
    longitude: 77.2105,
    blockageNote: 'Debris from collapsed overpass blocking Primary Boulevard — rerouting search & rescue unit.',
  },
  LANDSLIDE: {
    type: 'LANDSLIDE',
    description: 'Massive landslide on Mountain Pass Highway following torrential rainfall. Approximately 200 meters of road completely buried under mud and boulders. Three passenger vehicles caught under debris, passengers trapped. Immediate heavy earth-moving equipment and rescue squad needed.',
    location: 'Hillside Corridor, Sector 12',
    latitude: 28.6250,
    longitude: 77.2280,
    blockageNote: 'Secondary mudflow on hillside access road — initial responder rerouted via Western Ridgeline.',
  },
  ROAD_BLOCKAGE: {
    type: 'ROAD_BLOCKAGE',
    description: 'Severe arterial road blockage on National Express Highway NH-44. Overturned heavy cargo carrier and fallen electrical transmission towers blocking all 4 outbound lanes. Major gridlock obstructing emergency medical transit.',
    location: 'Expressway Interchange, Sector 9',
    latitude: 28.6180,
    longitude: 77.2150,
    blockageNote: 'Power line sparking on lane 2 — hazmat & heavy recovery team deployed for clearance.',
  },
  FLOOD: {
    type: 'FLOOD',
    description: 'Severe flash flooding in Riverside District. Water rising rapidly, multiple families trapped on rooftops, roads impassable. Urgent evacuation boats and medical aid needed.',
    location: 'Riverside District, Sector 7',
    latitude: 28.6139,
    longitude: 77.2090,
    blockageNote: 'Submerged bridge approach on Sector 7 Access Road — boat convoy deployed via Northern embankment.',
  },
}

export async function runHackathonDemo(
  officerId: string,
  scenarioKey: DemoScenarioType = 'EARTHQUAKE'
): Promise<{
  incidentId: string
  incidentCode: string
  scenario: DemoScenarioType
  simRunId: string
  steps: DemoStep[]
}> {
  const scenario = SCENARIOS[scenarioKey] || SCENARIOS.EARTHQUAKE
  const steps: DemoStep[] = []
  const pushStep = (label: string, extra: Partial<DemoStep> = {}) => {
    const s = { step: steps.length + 1, label, status: 'done' as const, ...extra }
    steps.push(s)
    broadcastEvent({ type: 'DEMO_STEP', label: `Step ${s.step}: ${label}`, data: s })
    return s
  }

  // Step 1: Citizen reports the disaster scenario
  const year = new Date().getFullYear()
  const count = await db.incident.count()
  const incidentCode = `RF-${year}-${String(count + 1).padStart(6, '0')}`
  const incident = await db.incident.create({
    data: {
      incidentCode,
      type: scenario.type,
      description: scenario.description,
      location: scenario.location,
      latitude: scenario.latitude,
      longitude: scenario.longitude,
      status: 'NEW',
      reportedById: officerId,
    },
  })
  await recordIncidentEvent(incident.id, 'INCIDENT_CREATED', {
    label: `${incident.incidentCode}: ${scenario.type} reported at ${scenario.location}`,
    code: incident.incidentCode,
    type: scenario.type,
  })
  await broadcastEvent({
    type: 'INCIDENT_CREATED',
    label: `${incident.incidentCode} created (DEMO: ${scenarioKey})`,
    incidentId: incident.id,
  })
  pushStep(`Citizen ${scenario.type.replace(/_/g, ' ')} report submitted`, { incidentId: incident.id })

  // Step 2: AI analysis, duplicate/clustering, risk calculation, resource recommendation
  await runIncidentWorkflow(incident.id)
  pushStep('Gemini AI Emergency Analysis → Risk Score Calculation → Resource Matching')

  await sleep(400)

  // Step 3: Officer approval workflow (AI pauses and requires human review)
  let approval = await db.approval.findFirst({
    where: { incidentId: incident.id, decision: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  })
  if (approval) {
    await approveAssignment(approval.id, officerId, `Officer approved AI resource recommendation for ${scenarioKey}`)
    pushStep('Officer Reviews & Approves Resource Recommendation')
  }

  // Step 4: Responder Live Status: ACKNOWLEDGED
  await sleep(350)
  await advanceResponse(incident.id, 'ACK', officerId)
  pushStep('Responder Live Status: ACKNOWLEDGED (Preparing departure)')

  // Step 5: Responder Live Status: EN ROUTE and ON SCENE
  await sleep(350)
  await advanceResponse(incident.id, 'START', officerId)
  pushStep('Responder Live Status: EN ROUTE (Navigating to coordinates)')

  await sleep(300)
  await advanceResponse(incident.id, 'ARRIVE', officerId)
  pushStep('Responder Live Status: ON SCENE (Active response operations underway)')

  // Step 6: Road blockage condition change & adaptive re-evaluation
  await sleep(300)
  await recordIncidentEvent(incident.id, 'ROAD_BLOCKED', {
    label: scenario.blockageNote,
    road: 'Primary Access Corridor',
  })
  const currentInc = await db.incident.findUnique({ where: { id: incident.id }, select: { assignedResourceId: true } })
  if (currentInc?.assignedResourceId) {
    await handleResourceUnavailable(currentInc.assignedResourceId, scenario.blockageNote)
  }
  pushStep('Environmental condition change: Road blockage triggers adaptive re-evaluation')

  // Step 7: Officer approves alternative resource
  await sleep(350)
  const altApproval = await db.approval.findFirst({
    where: { incidentId: incident.id, decision: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  })
  if (altApproval) {
    await approveAssignment(altApproval.id, officerId, 'Approved detour/alternative resource assignment')
    pushStep('Officer Approves Alternative Resource Deployment')
  }

  // Step 8: Simulation comparison (Baseline vs ResourceFlow AI)
  await sleep(250)
  const simRun = await runSimulation({
    scenario: scenario.type,
    options: { roadBlocked: true, ambulanceUnavailable: true, responseDelay: true, additionalIncidents: true },
  })
  pushStep('Simulation Benchmark: BASELINE vs RESOURCEFLOW efficiency computed', { simRunId: simRun.id })

  // Step 9: Incident resolution & automated report generation
  await sleep(300)
  await resolveIncident(incident.id, officerId)
  pushStep('Incident Resolved — Automated AI Incident Report Generated & Notifications Sent')

  return {
    incidentId: incident.id,
    incidentCode,
    scenario: scenarioKey,
    simRunId: simRun.id,
    steps,
  }
}
