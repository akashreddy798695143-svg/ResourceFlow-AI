// Duplicate detection + incident clustering service.
// Compares a new incident against recent (72h) incidents using:
//   - geographic proximity (<=2km)
//   - time proximity (<=24h)
//   - same incident type
//   - textual similarity (Jaccard on token sets)
// If a candidate cluster exists, attach; else create a new one.
// NEVER deletes duplicate reports — marks them POSSIBLE_DUPLICATE.

import { db } from '@/lib/db'
import type { Incident, IncidentCluster } from '@prisma/client'

export interface ClusteringResult {
  clusterId: string | null
  clusterCode: string | null
  clusterSize: number
  confidence: number
  duplicateFlag: boolean
  geoSpreadKm: number
  isExistingCluster: boolean
}

function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/\W+/).filter((t) => t.length > 3))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export async function clusterIncident(newIncident: Incident): Promise<ClusteringResult> {
  const since = new Date(Date.now() - 72 * 3600 * 1000)
  // Already in a cluster?
  if (newIncident.clusterId) {
    const existing = await db.incidentCluster.findUnique({ where: { id: newIncident.clusterId } })
    if (existing) {
      const ids: string[] = JSON.parse(existing.incidentIds)
      return {
        clusterId: existing.id,
        clusterCode: existing.clusterCode,
        clusterSize: ids.length,
        confidence: existing.confidence,
        duplicateFlag: true,
        geoSpreadKm: existing.geoSpreadKm,
        isExistingCluster: true,
      }
    }
  }

  // Find recent incidents of the same type within 24h & 2km
  const candidates = await db.incident.findMany({
    where: {
      type: newIncident.type,
      createdAt: { gte: since, lte: newIncident.createdAt },
      id: { not: newIncident.id },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const matched: Incident[] = []
  const newTokens = tokenize(`${newIncident.type} ${newIncident.description}`)
  for (const c of candidates) {
    const dist = haversineKm(newIncident.latitude, newIncident.longitude, c.latitude, c.longitude)
    if (dist > 2.0) continue
    const hours = (newIncident.createdAt.getTime() - c.createdAt.getTime()) / 3600000
    if (hours > 24 || hours < -24) continue
    const sim = jaccard(newTokens, tokenize(`${c.type} ${c.description}`))
    // require either same type (already filtered) + close, OR strong textual overlap
    if (sim >= 0.15 || dist <= 0.5) {
      matched.push(c)
    }
  }

  if (matched.length === 0) {
    return {
      clusterId: null,
      clusterCode: null,
      clusterSize: 1,
      confidence: 1,
      duplicateFlag: false,
      geoSpreadKm: 0,
      isExistingCluster: false,
    }
  }

  // If a matched incident already belongs to a cluster, attach to it.
  let cluster: IncidentCluster | null = null
  let allMembers = [newIncident, ...matched]
  const existingClusterMember = matched.find((m) => m.clusterId)
  if (existingClusterMember?.clusterId) {
    const foundCluster = await db.incidentCluster.findUnique({ where: { id: existingClusterMember.clusterId } })
    if (foundCluster) {
      const ids: string[] = JSON.parse(foundCluster.incidentIds)
      for (const m of matched) if (!ids.includes(m.id)) ids.push(m.id)
      ids.push(newIncident.id)
      const unique = [...new Set(ids)]
      const spread = computeSpread(unique, allMembers, newIncident)
      cluster = await db.incidentCluster.update({
        where: { id: foundCluster.id },
        data: {
          incidentIds: JSON.stringify(unique),
          confidence: Math.min(1, 0.7 + unique.length * 0.05),
          geoSpreadKm: spread,
          latestReportAt: newIncident.createdAt,
        },
      })
    }
  }

  if (!cluster) {
    // Create a new cluster
    const count = await db.incidentCluster.count()
    const clusterCode = `FC-${String(count + 1).padStart(3, '0')}`
    const ids = [newIncident.id, ...matched.map((m) => m.id)]
    const spread = computeSpread(ids, allMembers, newIncident)
    cluster = await db.incidentCluster.create({
      data: {
        clusterCode,
        type: newIncident.type,
        confidence: Math.min(1, 0.7 + ids.length * 0.05),
        incidentIds: JSON.stringify(ids),
        geoSpreadKm: spread,
        latestReportAt: newIncident.createdAt,
      },
    })
  }

  // Mark the matched (non-primary) reports as POSSIBLE_DUPLICATE if they are not the newest
  for (const m of matched) {
    if (m.id !== newIncident.id) {
      await db.incident.update({
        where: { id: m.id },
        data: { duplicateFlag: true, clusterId: cluster.id },
      })
    }
  }
  // New incident: also flag as duplicate and attach
  await db.incident.update({
    where: { id: newIncident.id },
    data: { duplicateFlag: matched.length > 0, clusterId: cluster.id },
  })

  const ids: string[] = JSON.parse(cluster.incidentIds)
  return {
    clusterId: cluster.id,
    clusterCode: cluster.clusterCode,
    clusterSize: ids.length,
    confidence: cluster.confidence,
    duplicateFlag: true,
    geoSpreadKm: cluster.geoSpreadKm,
    isExistingCluster: false,
  }
}

function computeSpread(ids: string[], allMembers: Incident[], anchor: Incident): number {
  // Approx spread: max pairwise distance among members (cap to compute cheaply)
  const pts = allMembers.length > 0 ? allMembers : [anchor]
  let max = 0
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = haversineKm(pts[i].latitude, pts[i].longitude, pts[j].latitude, pts[j].longitude)
      if (d > max) max = d
    }
  }
  return Number(max.toFixed(2))
}
