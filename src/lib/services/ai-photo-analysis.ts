// AI Photo Analysis Service
import { db } from '@/lib/db'
import { askAI, extractJson } from '@/lib/ai-client'
import { recordAudit } from '@/lib/events'

export interface PhotoAnalysisResult {
  ok: boolean
  analysis?: {
    observations: string[]
    damageType: string[]
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    peopleVisible: number | null
    vehiclesVisible: number | null
    infrastructureDamage: string[]
    environmentalHazards: string[]
    recommendedAction: string
    confidence: number
    requiresOfficerVerification: boolean
  }
  error?: string
  demo?: boolean
}

interface PhotoAnalysisJson {
  observations?: string[]
  damageType?: string[]
  severity?: string
  peopleVisible?: number
  vehiclesVisible?: number
  infrastructureDamage?: string[]
  environmentalHazards?: string[]
  recommendedAction?: string
  confidence?: number
}

const PHOTO_ANALYSIS_SYSTEM_PROMPT = `You are an AI assistant for emergency disaster response. Analyze the provided incident photo and citizen description.

IMPORTANT GUIDELINES:
1. Your observations are AI-ASSISTED and require officer verification
2. Never state observations as guaranteed facts
3. Be conservative in assessments
4. Focus on visible evidence only

Analyze the image for:
- Type of damage (flooding, fire, structural, road blockage, etc.)
- Severity indicators
- People or vehicles visible
- Infrastructure damage
- Environmental hazards
- Recommended immediate actions

Respond in JSON format:
{
  "observations": ["list of visible observations"],
  "damageType": ["type of damage detected"],
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "peopleVisible": number or null,
  "vehiclesVisible": number or null,
  "infrastructureDamage": ["list"],
  "environmentalHazards": ["list"],
  "recommendedAction": "recommended response action",
  "confidence": 0.0-1.0,
  "requiresOfficerVerification": true
}`

// Analyze incident photo with AI
export async function analyzeIncidentPhoto(
  incidentId: string,
  imageDataUri: string,
  description: string
): Promise<PhotoAnalysisResult> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return generateDemoAnalysis(incidentId, description)
    }

    const userPrompt = `Citizen report description: "${description}"

Analyze this incident photo and provide structured observations. Remember: all observations are AI-assisted and require officer verification.`

    const result = await askAI(PHOTO_ANALYSIS_SYSTEM_PROMPT, userPrompt)

    if (!result.ok) {
      return generateDemoAnalysis(incidentId, description)
    }

    const analysis = extractJson<PhotoAnalysisJson>(result.content)

    if (!analysis) {
      return generateDemoAnalysis(incidentId, description)
    }

    const normalizedAnalysis = {
      observations: Array.isArray(analysis.observations) ? analysis.observations : ['Photo analyzed'],
      damageType: Array.isArray(analysis.damageType) ? analysis.damageType : ['Unknown'],
      severity: (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(analysis.severity).toUpperCase())
        ? String(analysis.severity).toUpperCase()
        : 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      peopleVisible: typeof analysis.peopleVisible === 'number' ? analysis.peopleVisible : null,
      vehiclesVisible: typeof analysis.vehiclesVisible === 'number' ? analysis.vehiclesVisible : null,
      infrastructureDamage: Array.isArray(analysis.infrastructureDamage) ? analysis.infrastructureDamage : [],
      environmentalHazards: Array.isArray(analysis.environmentalHazards) ? analysis.environmentalHazards : [],
      recommendedAction: analysis.recommendedAction || 'Review and assign appropriate response',
      confidence: typeof analysis.confidence === 'number' ? Math.min(1, Math.max(0, analysis.confidence)) : 0.5,
      requiresOfficerVerification: true,
    }

    await storeAnalysisResult(incidentId, normalizedAnalysis, false)

    return {
      ok: true,
      analysis: normalizedAnalysis,
    }
  } catch (error) {
    console.error('[ai-photo-analysis] Error:', error)
    return generateDemoAnalysis(incidentId, description)
  }
}

// Store analysis result in database
async function storeAnalysisResult(
  incidentId: string,
  analysis: PhotoAnalysisResult['analysis'],
  isDemo: boolean
) {
  if (!analysis) return

  try {
    await db.aIRecommendation.create({
      data: {
        incidentId,
        recType: 'PHOTO_ANALYSIS',
        payload: JSON.stringify(analysis),
        source: isDemo ? 'demo' : 'gemini-vision',
      },
    })

    await db.incident.update({
      where: { id: incidentId },
      data: {
        aiSeverity: analysis.severity,
        aiConfidence: analysis.confidence,
        aiRiskFactors: JSON.stringify(analysis.environmentalHazards),
        aiInfrastructureDamage: JSON.stringify(analysis.infrastructureDamage),
        aiPeopleAffected: analysis.peopleVisible,
        aiRoadBlocked: analysis.damageType.some(d =>
          d.toLowerCase().includes('road') || d.toLowerCase().includes('block')
        ),
        aiUrgentNeeds: JSON.stringify(analysis.observations.slice(0, 3)),
        aiMissingInfo: JSON.stringify([]),
        aiAvailable: true,
      },
    })

    await recordAudit({
      action: 'AI_PHOTO_ANALYSIS',
      entityId: incidentId,
      newState: `Photo analysis completed (${isDemo ? 'demo' : 'AI'})`,
      reason: `Severity: ${analysis.severity}, Confidence: ${analysis.confidence}`,
    }).catch(() => {})
  } catch (error) {
    console.error('[ai-photo-analysis] Failed to store result:', error)
  }
}

// Generate demo analysis when AI is unavailable
async function generateDemoAnalysis(
  incidentId: string,
  description: string
): Promise<PhotoAnalysisResult> {
  const demoAnalysis = {
    observations: [
      'AI-Assisted Observation: Photo received and queued for analysis',
      'Citizen report indicates emergency situation',
      'Visual evidence attached for officer review',
      'Requires officer verification and assessment',
    ],
    damageType: ['Pending officer assessment'],
    severity: 'MEDIUM' as const,
    peopleVisible: null,
    vehiclesVisible: null,
    infrastructureDamage: [],
    environmentalHazards: [],
    recommendedAction: 'Officer review required. Assess photo evidence and citizen description to determine appropriate response.',
    confidence: 0.5,
    requiresOfficerVerification: true,
  }

  await storeAnalysisResult(incidentId, demoAnalysis, true)

  return {
    ok: true,
    analysis: demoAnalysis,
    demo: true,
  }
}

// Get photo analysis for an incident
export async function getPhotoAnalysis(incidentId: string) {
  try {
    const recommendations = await db.aIRecommendation.findMany({
      where: {
        incidentId,
        recType: 'PHOTO_ANALYSIS',
      },
      orderBy: { createdAt: 'desc' },
    })

    return recommendations.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      source: r.source,
      analysis: JSON.parse(r.payload),
    }))
  } catch {
    return []
  }
}