'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { IncidentStatus, IncidentType, RiskLevel, ResourceStatus, ResourceType, NotificationType } from '@/lib/types'

const STATUS_STYLES: Record<IncidentStatus, string> = {
  NEW: 'bg-muted text-muted-foreground',
  ANALYZING: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  VERIFICATION: 'bg-muted text-muted-foreground',
  PRIORITIZED: 'bg-accent text-accent-foreground',
  AWAITING_APPROVAL: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ASSIGNED: 'bg-primary/20 text-primary border-primary/40',
  IN_PROGRESS: 'bg-primary/15 text-primary border-primary/30',
  DELAYED: 'bg-red-500/15 text-red-400 border-red-500/30',
  ESCALATED: 'bg-red-500/15 text-red-400 border-red-500/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
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
  LOW: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  HIGH: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
}

export function RiskBadge({ level, score, className }: { level: RiskLevel; score?: number; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-mono text-[10px] uppercase', RISK_STYLES[level], className)}>
      {level}{score != null ? ` · ${score}` : ''}
    </Badge>
  )
}

const RESOURCE_STATUS_STYLES: Record<ResourceStatus, string> = {
  AVAILABLE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ASSIGNED: 'bg-primary/20 text-primary border-primary/40',
  EN_ROUTE: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ON_SCENE: 'bg-primary/20 text-primary border-primary/40',
  DISPATCHED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ARRIVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  UNAVAILABLE: 'bg-red-500/15 text-red-400 border-red-500/30',
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
  INFO: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  WARNING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
  APPROVAL_REQUIRED: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  ESCALATION: 'bg-red-500/15 text-red-400 border-red-500/30',
  RESOLUTION: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

export function NotificationTypeBadge({ type, className }: { type: NotificationType; className?: string }) {
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium uppercase', NOTIF_STYLES[type], className)}>
      {type.replace(/_/g, ' ')}
    </Badge>
  )
}
