// Nearest Help Match — intelligent nearby-help matching.
// Combines multiple existing sources of help data:
//   - Resources (Resource model — dispatchable emergency units)
//   - SafePlace (citizen-facing safe places: shelter, hospital, relief center)
//   - Hospital (medical facility)
//   - EmergencyService (police / fire / ambulance / etc.)
// Never fabricates data. If no records exist → returns "DATA UNAVAILABLE".

import { db } from '@/lib/db'
import { haversineKm } from '@/lib/agents/resource-agent'

export interface NearestHelpRequest {
  // Authorized reference location
  lat: number
  lng: number
  // Optional filters
  kind?: 'medical' | 'rescue' | 'shelter' | 'safe' | 'all'
  incidentType?: string | null
  limit?: number
}

export interface NearbyHelpItem {
  kind: 'medical' | 'rescue' | 'shelter' | 'safe' | 'resource'
  name: string
  category: string
  status: string
  distanceKm: number
  estimatedMinutes: number | null
  lat: number
  lng: number
  address: string | null
  phone: string | null
  source: 'database'
  notes: string | null
}

export interface NearestHelpResult {
  available: boolean
  dataUnavailableReason?: string
  reference: { lat: number; lng: number }
  items: NearbyHelpItem[]
  groups: Array<{ kind: string; label: string; icon: string; items: NearbyHelpItem[] }>
  generatedAt: string
}

const KIND_TO_TYPES: Record<string, { safePlace: string[]; resource: string[]; emergencyService: string[] }> = {
  medical: {
    safePlace: ['HOSPITAL', 'EMERGENCY_MEDICAL_CENTER'],
    resource: ['AMBULANCE', 'MEDICAL_SUPPLY'],
    emergencyService: ['HOSPITAL'],
  },
  rescue: {
    safePlace: ['EMERGENCY_SERVICE', 'FIRE_RESCUE'],
    resource: ['RESCUE_TEAM', 'FIRE_TEAM', 'EMERGENCY_VEHICLE'],
    emergencyService: ['FIRE_STATION', 'POLICE', 'AMBULANCE_SERVICE'],
  },
  shelter: {
    safePlace: ['EMERGENCY_SHELTER', 'RELIEF_CENTER', 'SAFE_ZONE'],
    resource: ['FOOD_SUPPLY', 'WATER_SUPPLY'],
    emergencyService: ['SHELTER', 'RELIEF_CENTER'],
  },
  safe: {
    safePlace: ['SAFE_ZONE', 'EMERGENCY_SHELTER', 'HOSPITAL', 'RELIEF_CENTER'],
    resource: [],
    emergencyService: ['SAFE_ZONE'],
  },
  all: {
    safePlace: [], // include all
    resource: [],
    emergencyService: [], // include all
  },
}

const KIND_LABEL_ICON: Record<string, { label: string; icon: string }> = {
  medical: { label: 'Medical Support', icon: '🚑' },
  rescue: { label: 'Rescue Resource', icon: '🚤' },
  shelter: { label: 'Safe Shelter', icon: '🏠' },
  safe: { label: 'Safe Locations', icon: '🛟' },
  all: { label: 'All Help Options', icon: '📍' },
  resource: { label: 'Emergency Resources', icon: '🚨' },
}

function relevanceScore(item: { kind: string; status: string }, priorityRank: number, distanceKm: number, availabilityRank: number): number {
  // Lower is better. Distance + availability + relevance.
  return distanceKm - availabilityRank * 5 - priorityRank * 5 + (item.kind === 'medical' ? -2 : 0)
}

export async function findNearestHelp(req: NearestHelpRequest): Promise<NearestHelpResult> {
  const limit = Math.max(1, Math.min(20, req.limit ?? 6))
  const kind = req.kind || 'all'

  if (!Number.isFinite(req.lat) || !Number.isFinite(req.lng)) {
    return {
      available: false,
      dataUnavailableReason: 'invalid_reference',
      reference: { lat: req.lat, lng: req.lng },
      items: [],
      groups: [],
      generatedAt: new Date().toISOString(),
    }
  }

  try {
    const mapping = KIND_TO_TYPES[kind] || KIND_TO_TYPES.all

    // Fetch from each model as permitted by the kind.
    const [safePlacesRaw, resourcesRaw, emergencyServicesRaw, hospitalsRaw] = await Promise.all([
      mapping.safePlace.length === 0
        ? db.safePlace.findMany()
        : db.safePlace.findMany({ where: { type: { in: mapping.safePlace } as any } }),
      mapping.resource.length === 0
        ? db.resource.findMany()
        : db.resource.findMany({ where: { type: { in: mapping.resource as any } } }),
      mapping.emergencyService.length === 0
        ? db.emergencyService.findMany()
        : db.emergencyService.findMany({ where: { type: { in: mapping.emergencyService } as any } }),
      db.hospital.findMany(),
    ])

    const items: NearbyHelpItem[] = []

    // Map SafePlace to items
    for (const p of safePlacesRaw) {
      const d = Number(haversineKm(req.lat, req.lng, p.latitude, p.longitude).toFixed(2))
      const isMedical = /HOSPITAL|EMERGENCY_MEDICAL/.test(p.type)
      items.push({
        kind: isMedical ? 'medical' : /SHELTER|SAFE|RELIEF/.test(p.type) ? 'shelter' : 'safe',
        name: p.name,
        category: p.type.replace(/_/g, ' '),
        status: p.availability ?? 'UNKNOWN',
        distanceKm: d,
        estimatedMinutes: d > 0 ? Math.max(1, Math.round((d / 40) * 60)) : null,
        lat: p.latitude,
        lng: p.longitude,
        address: p.address ?? null,
        phone: p.phone ?? null,
        source: 'database',
        notes: p.amenities ?? null,
      })
    }

    // Map Resource to items
    for (const r of resourcesRaw) {
      const d = Number(haversineKm(req.lat, req.lng, r.latitude, r.longitude).toFixed(2))
      const isMedical = /AMBULANCE|MEDICAL/i.test(r.type)
      const isRescue = /RESCUE|FIRE|EMERGENCY/i.test(r.type)
      items.push({
        kind: isMedical ? 'medical' : isRescue ? 'rescue' : 'resource',
        name: r.name,
        category: r.type.replace(/_/g, ' '),
        status: r.status,
        distanceKm: d,
        estimatedMinutes: d > 0 ? Math.max(1, Math.round((d / 40) * 60)) : null,
        lat: r.latitude,
        lng: r.longitude,
        address: null,
        phone: null,
        source: 'database',
        notes: `Emergency resource ${r.resourceCode} (capacity ${r.capacity})`,
      })
    }

    // Map EmergencyService
    for (const e of emergencyServicesRaw) {
      const d = Number(haversineKm(req.lat, req.lng, e.latitude, e.longitude).toFixed(2))
      const isMedical = /HOSPITAL/i.test(e.type)
      items.push({
        kind: isMedical ? 'medical' : /FIRE|RESCUE|POLICE/.test(e.type) ? 'rescue' : 'safe',
        name: e.name,
        category: e.type.replace(/_/g, ' '),
        status: e.availability ?? 'UNKNOWN',
        distanceKm: d,
        estimatedMinutes: d > 0 ? Math.max(1, Math.round((d / 40) * 60)) : null,
        lat: e.latitude,
        lng: e.longitude,
        address: e.address ?? null,
        phone: e.phone ?? null,
        source: 'database',
        notes: e.services ?? null,
      })
    }

    // Map Hospital
    for (const h of hospitalsRaw) {
      const d = Number(haversineKm(req.lat, req.lng, h.latitude, h.longitude).toFixed(2))
      items.push({
        kind: 'medical',
        name: h.name,
        category: 'HOSPITAL',
        status: h.status,
        distanceKm: d,
        estimatedMinutes: d > 0 ? Math.max(1, Math.round((d / 40) * 60)) : null,
        lat: h.latitude,
        lng: h.longitude,
        address: null,
        phone: null,
        source: 'database',
        notes: `${h.availableBeds != null ? `${h.availableBeds}/${h.totalBeds} beds available` : 'Hospital facility'}`,
      })
    }

    // Filter out unavailable resources per relevance (unless shelter/Hospital)
    // For resources that are UNAVAILABLE, drop them
    const filtered = items.filter((it) => {
      if (it.kind === 'resource' && /UNAVAILABLE/i.test(it.status)) return false
      return true
    })

    // Rank by relevance then availability then distance then priority
    const availabilityRank = (s: string) => {
      const u = (s || '').toUpperCase()
      if (u === 'AVAILABLE' || u === 'OPEN' || u === 'ACCEPTING') return 3
      if (u === 'BUSY' || u === 'LIMITED') return 2
      if (u === 'FULL' || u === 'CLOSED' || u === 'UNAVAILABLE') return 0
      return 1
    }
    const priorityRank = (k: string) => {
      if (k === 'medical') return 3
      if (k === 'rescue') return 2
      if (k === 'shelter' || k === 'safe') return 1
      return 0
    }

    const sorted = filtered
      .map((it) => ({
        ...it,
        _score: relevanceScore(it, priorityRank(it.kind), it.distanceKm, availabilityRank(it.status)),
      }))
      .sort((a, b) => a._score - b._score || a.distanceKm - b.distanceKm)

    const topItems = sorted.slice(0, limit)

    // Group by kind
    const groupKeys = Array.from(new Set(topItems.map((i) => i.kind)))
    const groups = groupKeys.map((k) => {
      const meta = KIND_LABEL_ICON[k] || KIND_LABEL_ICON.resource
      return {
        kind: k,
        label: meta.label,
        icon: meta.icon,
        items: topItems.filter((i) => i.kind === k),
      }
    })

    return {
      available: true,
      reference: { lat: req.lat, lng: req.lng },
      items: topItems,
      groups,
      generatedAt: new Date().toISOString(),
    }
  } catch (e) {
    return {
      available: false,
      dataUnavailableReason: 'database_unavailable',
      reference: { lat: req.lat, lng: req.lng },
      items: [],
      groups: [],
      generatedAt: new Date().toISOString(),
    }
  }
}
