// Shared frontend types (mirror of backend Prisma models). Kept lightweight.

export type Role = 'CITIZEN' | 'RESPONDER' | 'DISASTER_OFFICER' | 'ADMIN'

export type IncidentType =
  | 'FLOOD' | 'CYCLONE' | 'EARTHQUAKE' | 'LANDSLIDE' | 'ROAD_BLOCKAGE'
  | 'FIRE' | 'MEDICAL' | 'INFRASTRUCTURE' | 'OTHER'

export type IncidentStatus =
  | 'NEW' | 'ANALYZING' | 'VERIFICATION' | 'PRIORITIZED' | 'AWAITING_APPROVAL'
  | 'ASSIGNED' | 'IN_PROGRESS' | 'DELAYED' | 'ESCALATED' | 'RESOLVED' | 'CLOSED'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type ResourceType =
  | 'AMBULANCE' | 'RESCUE_TEAM' | 'FIRE_TEAM' | 'EMERGENCY_VEHICLE'
  | 'MEDICAL_SUPPLY' | 'FOOD_SUPPLY' | 'WATER_SUPPLY'

export type ResourceStatus = 'AVAILABLE' | 'ASSIGNED' | 'EN_ROUTE' | 'ON_SCENE' | 'UNAVAILABLE'

export type NotificationType =
  | 'INFO' | 'WARNING' | 'CRITICAL' | 'APPROVAL_REQUIRED' | 'ESCALATION' | 'RESOLUTION'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  active?: boolean
  phone?: string | null
  phoneVerified?: boolean
  emailVerified?: boolean
  createdAt?: string
}

export interface Incident {
  id: string
  incidentCode: string
  type: IncidentType
  description: string
  location: string
  latitude: number
  longitude: number
  imageMeta: string | null
  status: IncidentStatus
  duplicateFlag: boolean
  // Citizen identity (auto-derived from session)
  citizenName?: string | null
  citizenPhone?: string | null
  citizenEmail?: string | null
  // Original input + language
  originalDescription?: string | null
  transcription?: string | null
  language?: string | null
  inputMethod?: string | null
  // Location capture metadata
  locationAccuracy?: number | null
  locationTimestamp?: string | null
  aiSeverity: string | null
  aiPeopleAffected: number | null
  aiUrgentNeeds: string | null
  aiRoadBlocked: boolean | null
  aiInfrastructureDamage: string | null
  aiRiskFactors: string | null
  aiConfidence: number | null
  aiMissingInfo: string | null
  aiAvailable: boolean
  riskScore: number | null
  riskLevel: RiskLevel | null
  riskReasons: string | null
  weather: string | null
  clusterId: string | null
  assignedResourceId: string | null
  assignedAt: string | null
  acknowledgedAt: string | null
  startedAt: string | null
  arrivedAt: string | null
  resolvedAt: string | null
  escalationLevel: number
  reportedById: string
  reportedBy?: { name: string }
  events?: IncidentEvent[]
  approvals?: Approval[]
  assignments?: ResourceAssignment[]
  recommendations?: AIRecommendation[]
  report?: GeneratedReport | null
  createdAt: string
  updatedAt: string
}

export interface IncidentEvent {
  id: string
  incidentId: string
  eventType: string
  data: string
  createdAt: string
}

export interface Resource {
  id: string
  resourceCode: string
  name: string
  type: ResourceType
  latitude: number
  longitude: number
  capacity: number
  status: ResourceStatus
  eta: number | null
  lastUpdated: string
  createdAt: string
  updatedAt: string
}

export interface ResourceAssignment {
  id: string
  resourceId: string
  incidentId: string
  status: string
  isPrimary: boolean
  reason?: string | null
  assignedById?: string | null
  assignedAt: string
  replacedAt?: string | null
}

export interface Approval {
  id: string
  incidentId: string
  resourceId: string | null
  recommendation: string
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewerId: string | null
  reason: string | null
  reviewedAt: string | null
  createdAt: string
  incident?: { incidentCode: string; type: IncidentType; location: string; riskLevel: RiskLevel; riskScore: number }
}

export interface AIRecommendation {
  id: string
  incidentId: string
  recType: string
  payload: string
  source: string
  createdAt: string
}

export interface Notification {
  id: string
  type: NotificationType
  message: string
  read: boolean
  userId: string | null
  entityId: string | null
  createdAt: string
}

export interface GeneratedReport {
  id: string
  incidentId: string
  content: string
  createdAt: string
}

export interface AuditLog {
  id: string
  timestamp: string
  userId: string | null
  user?: { name: string; email: string } | null
  role: string | null
  action: string
  entityId: string | null
  previousState: string | null
  newState: string | null
  reason: string | null
}

export interface SimulationRun {
  id: string
  scenario: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  config: string
  metrics: string | null
  events?: SimulationEvent[]
  createdAt: string
  updatedAt: string
}

export interface SimulationEvent {
  id: string
  runId: string
  simTimeMin: number
  eventType: string
  label: string
  data: string
  createdAt: string
}

export interface Analytics {
  totalIncidents: number
  criticalIncidents: number
  activeIncidents: number
  availableResources: number
  assignedResources: number
  unavailableResources: number
  delayedResponses: number
  escalatedIncidents: number
  resolvedIncidents: number
  pendingApprovals: number
  avgResponseTimeMin: number
  avgResolutionTimeMin: number
  resourceConflicts: number
  resourceUtilizationPct: number
  timeline: { date: string; count: number }[]
  byType: Record<string, number>
  byStatus: Record<string, number>
  riskBreakdown: Record<string, number>
}

export interface DashboardEvent {
  type: string
  label: string
  incidentId?: string
  resourceId?: string
  data?: any
  timestamp: string
}
