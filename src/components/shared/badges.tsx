'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { IncidentStatus, IncidentType, RiskLevel, ResourceStatus, ResourceType, NotificationType } from '@/lib/types'

const STATUS_STYLES: Record<IncidentStatus, string> = {
  NEW: 'bg-muted text-muted-foreground',
  ANALYZING: 'bg-sev-MEDIUM text-foreground border-sev-MEDIUM',
  VERIFICATION: 'bg-muted text-muted-foreground',
  PRIORITIZED: 'bg-accent text-accent-foreground',
  AWAITING_APPROVAL: 'bg-sev-HIGH text-foreground border-sev-HIGH',
  ASSIGNED: 'bg-primary/20 text-primary border-primary/40',
  IN_PROGRESS: 'bg-primary/15 text-primary border-primary/30',
  DELAYED: 'bg-sev-CRITICAL text-foreground border-sev-CRITICAL',
  ESCALATED: 'bg-sev-CRITICAL text-foreground border-sev-CRITICAL',
  RESOLVED: 'bg-sev-LOW text-foreground border-sev-LOW',
  CLOSED: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ status, className }: { status: IncidentStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', STATUS_STYLES[status] || '', className)}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

const RISK_STYLES: Record<RiskLevel, string> = {
  LOW: 'bg-sev-LOW text-sev-LOW border-sev-LOW',
  MEDIUM: 'bg-sev-MEDIUM text-sev-MEDIUM border-sev-MEDIUM',
  HIGH: 'bg-sev-HIGH text-sev-HIGH border-sev-HIGH',
  CRITICAL: 'bg-sev-CRITICAL text-sev-CRITICAL border-sev-CRITICAL',
}

export function RiskBadge({ level, score, className }: { level: RiskLevel; score?: number; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', RISK_STYLES[level], className)}>
      {level}{score != null ? ` · ${score}` : ''}
    </Badge>
  )
}

const RESOURCE_STATUS_STYLES: Record<ResourceStatus, string> = {
  AVAILABLE: 'bg-sev-LOW text-sev-LOW border-sev-LOW',
  ASSIGNED: 'bg-primary/20 text-primary border-primary/40',
  EN_ROUTE: 'bg-sev-MEDIUM text-sev-MEDIUM border-sev-MEDIUM',
  ON_SCENE: 'bg-primary/20 text-primary border-primary/40',
  UNAVAILABLE: 'bg-sev-CRITICAL text-sev-CRITICAL border-sev-CRITICAL',
}

export function ResourceStatusBadge({ status, className }: { status: ResourceStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', RESOURCE_STATUS_STYLES[status], className)}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

const TYPE_LABELS: Record<IncidentType, string> = {
  FLOOD: 'Flood',
  CYCLONE: 'Cyclone',
  EARTHQUAKE: 'Earthquake',
  LANDSLIDE: 'Landslide',
  ROAD_BLOCKAGE: 'Road Blockage',
  FIRE: 'Fire',
  MEDICAL: 'Medical',
  INFRASTRUCTURE: 'Infrastructure',
  BUILDING_COLLAPSE: 'Building Collapse',
  FOREST_FIRE: 'Forest Fire',
  HEAVY_RAINFALL: 'Heavy Rainfall',
  INDUSTRIAL_ACCIDENT: 'Industrial Accident',
  OTHER: 'Other',
}

export function IncidentTypeBadge({ type, className }: { type: IncidentType; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('text-[10px] font-medium', className)}>
      {TYPE_LABELS[type] || type}
    </Badge>
  )
}

export const INCIDENT_TYPE_LABELS = TYPE_LABELS
export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  AMBULANCE: 'Ambulance',
  RESCUE_TEAM: 'Rescue Team',
  FIRE_TEAM: 'Fire Team',
  EMERGENCY_VEHICLE: 'Emergency Vehicle',
  MEDICAL_SUPPLY: 'Medical Supply',
  FOOD_SUPPLY: 'Food Supply',
  WATER_SUPPLY: 'Water Supply',
}

const NOTIF_STYLES: Record<NotificationType, string> = {
  INFO: 'bg-primary/15 text-primary border-primary/30',
  WARNING: 'bg-sev-MEDIUM text-sev-MEDIUM border-sev-MEDIUM',
  CRITICAL: 'bg-sev-CRITICAL text-sev-CRITICAL border-sev-CRITICAL',
  APPROVAL_REQUIRED: 'bg-sev-HIGH text-sev-HIGH border-sev-HIGH',
  ESCALATION: 'bg-sev-CRITICAL text-sev-CRITICAL border-sev-CRITICAL',
  RESOLUTION: 'bg-sev-LOW text-sev-LOW border-sev-LOW',
}

export function NotificationTypeBadge({ type, className }: { type: NotificationType; className?: string }) {
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium uppercase', NOTIF_STYLES[type], className)}>
      {type.replace(/_/g, ' ')}
    </Badge>
  )
}
