import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api'

// Free routing via the public OSRM demo server (OpenStreetMap ecosystem —
// matches the project's existing OSM/Leaflet stack, no API key required).
// Falls back to a straight-line estimate when the service is unreachable so
// the UI degrades gracefully instead of fabricating a route.

export interface RouteStep {
  instruction: string
  distanceMeters: number
  durationSeconds: number
  name: string
  maneuver: string
  location: [number, number] // [lat, lng]
}

export interface RouteResult {
  available: boolean
  reason?: string
  provider: 'OSRM' | 'STRAIGHT_LINE_FALLBACK'
  distanceKm: number
  durationMin: number
  geometry: [number, number][] // [lat, lng]
  steps: RouteStep[]
}

function maneuverToInstruction(maneuver: any, name: string): string {
  const type: string = maneuver?.type ?? ''
  const modifier: string = maneuver?.modifier ?? ''
  const road = name && name !== '' ? ` onto ${name}` : ''
  switch (type) {
    case 'depart': return `Head out${road}`
    case 'arrive': return 'Arrive at destination'
    case 'turn':
      if (modifier === 'left') return `Turn left${road}`
      if (modifier === 'right') return `Turn right${road}`
      if (modifier === 'uturn') return 'Make a U-turn'
      return `Turn ${modifier || ''}${road}`.trim()
    case 'new name': return `Continue${road}`
    case 'continue': return `Continue ${modifier || 'straight'}${road}`
    case 'merge': return `Merge ${modifier || ''}${road}`.trim()
    case 'on ramp': return `Take the ramp${road}`
    case 'off ramp': return 'Take the next exit'
    case 'roundabout': case 'rotary': return 'At the roundabout, take the exit'
    case 'fork': return `Keep ${modifier || 'straight'} at the fork`
    case 'end of road': return `At the end of the road, turn ${modifier || ''}`.trim()
    default: return `Continue${road}`
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fromLat = Number(searchParams.get('fromLat'))
  const fromLng = Number(searchParams.get('fromLng'))
  const toLat = Number(searchParams.get('toLat'))
  const toLng = Number(searchParams.get('toLng'))

  const valid = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max
  if (!valid(fromLat, -90, 90) || !valid(toLat, -90, 90) || !valid(fromLng, -180, 180) || !valid(toLng, -180, 180)) {
    return err('Invalid from/to coordinates', 422)
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const data = await res.json()
    const route = data?.routes?.[0]
    if (!route) throw new Error('no route')

    const geometry: [number, number][] = (route.geometry?.coordinates ?? []).map(
      (c: [number, number]) => [c[1], c[0]] as [number, number]
    )
    const steps: RouteStep[] = []
    for (const leg of route.legs ?? []) {
      for (const step of leg.steps ?? []) {
        const maneuver = step.maneuver ?? {}
        steps.push({
          instruction: maneuverToInstruction(maneuver, step.name ?? ''),
          distanceMeters: Math.round(step.distance ?? 0),
          durationSeconds: Math.round(step.duration ?? 0),
          name: step.name ?? '',
          maneuver: `${maneuver.type ?? ''}${maneuver.modifier ? `:${maneuver.modifier}` : ''}`,
          location: [maneuver.location?.[1] ?? 0, maneuver.location?.[0] ?? 0],
        })
      }
    }
    // Drop trivial single "Continue" placeholders OSRM adds; keep real instructions.
    const meaningful = steps.filter((s) => s.instruction !== 'Continue' || steps.length <= 2)

    const result: RouteResult = {
      available: true,
      provider: 'OSRM',
      distanceKm: Math.round((route.distance / 1000) * 100) / 100,
      durationMin: Math.max(1, Math.round(route.duration / 60)),
      geometry,
      steps: meaningful,
    }
    return ok(result)
  } catch {
    // Straight-line fallback — clearly labelled, never presented as a street route.
    const R = 6371
    const dLat = ((toLat - fromLat) * Math.PI) / 180
    const dLng = ((toLng - fromLng) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((fromLat * Math.PI) / 180) * Math.cos((toLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    const d = 2 * R * Math.asin(Math.sqrt(a))
    const result: RouteResult = {
      available: false,
      reason: 'Routing service unavailable — showing straight-line estimate only.',
      provider: 'STRAIGHT_LINE_FALLBACK',
      distanceKm: Math.round(d * 100) / 100,
      durationMin: Math.max(1, Math.round((d / 30) * 60)), // ~30 km/h urban emergency avg
      geometry: [
        [fromLat, fromLng],
        [toLat, toLng],
      ],
      steps: [],
    }
    return ok(result)
  }
}
