// Advanced AI pipeline — hooks the 20 SIH features into the existing incident
// workflow: REPORT → AI ANALYSIS → (advanced analysis) → PRIORITIZE → RECOMMEND
// → OFFICER APPROVAL → DEPLOY → TRACK → ESCALATE → RESOLVE → (learning loop).
// Called fire-and-forget from incident-workflow.ts — never blocks the pipeline.

import { db } from '@/lib/db'
import { computeTrustScore, predictCrowdRisk, analyzeEvidence, detectCascades, resolveResourceConflicts, refreshDemandForecasts, runLearningLoop } from '@/lib/services/advanced-service'

export async function runAdvancedAnalysis(incidentId: string) {
  try {
    const inc = await db.incident.findUnique({ where: { id: incidentId } })
    if (!inc) return
    await computeTrustScore(inc)
    await predictCrowdRisk(inc)
    await analyzeEvidence(incidentId, inc.imageMeta ? 'DRONE' : 'SATELLITE')
  } catch (e) {
    console.error('[advanced-pipeline] analysis stage failed (non-fatal):', e)
  }
}

export async function runAdvancedGlobalSweep() {
  try {
    await detectCascades()
    await resolveResourceConflicts()
    await refreshDemandForecasts()
  } catch (e) {
    console.error('[advanced-pipeline] global sweep failed (non-fatal):', e)
  }
}

export async function runLearningLoopForResolved() {
  try {
    return await runLearningLoop()
  } catch (e) {
    console.error('[advanced-pipeline] learning loop failed (non-fatal):', e)
    return null
  }
}
