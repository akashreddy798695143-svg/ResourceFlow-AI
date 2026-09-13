import { haversineKm } from '@/lib/agents/resource-agent'

// Shared Nearby Help place search — real OpenStreetMap Overpass data.
// Used by /api/places/nearby (citizen UI) and the chatbot context builder.
// Nothing is invented; missing fields return null and the UI shows
// "Information unavailable".

export const CATEGORY_QUERIES: Record<string, string[]> = {
  hospital: ['nwr[amenity=hospital]'],
  clinic: ['nwr[amenity=clinic]', 'nwr[amenity=doctors]'],
  medical_center: ['nwr[amenity=clinic]', 'nwr[amenity=doctors]'],
  pharmacy: ['nwr[amenity=pharmacy]'],
  police: ['nwr[amenity=police]'],
  fire_station: ['nwr[amenity=fire_station]'],
  ambulance: ['nwr[emergency=ambulance_station]', 'nwr[amenity=emergency_service]'],
  shelter: ['nwr[amenity=shelter]', 'nwr[emergency=safe_place]', 'nwr[amenity=refugee_site]'],
  relief: ['nwr[office=government][name~"relief|disaster|emergency",i]'],
  food_water: ['nwr[amenity=drinking_water]', 'nwr[amenity=food_bank]'],
  government: ['nwr[office=government]', 'nwr[amenity=public_building]'],
}

export const CATEGORY_LABELS: Record<string, string> = {
  hospital: 'Hospital',
  clinic: 'Emergency Clinic',
  medical_center: 'Medical Center',
  pharmacy: 'Pharmacy',
  police: 'Police Station',
  fire_station: 'Fire Station',
  ambulance: 'Ambulance Service',
  shelter: 'Emergency Shelter / Safe Place',
  relief: 'Relief Center',
  food_water: 'Emergency Food / Water Point',
  government: 'Government Emergency Center',
}

export interface NearbyPlace {
  id: string
  osmType: string
  osmId: number
  name: string
  category: string
  categoryLabel: string
  lat: number
  lng: number
  address: string | null
  phone: string | null
  website: string | null
  openingHours: string | null
  emergencyCapable: boolean
  image: string | null
  distanceKm: number
}

function normalizeImageTag(tags: Record<string, string>): string | null {
  const raw = tags.image || tags.wikimedia_commons
  if (!raw) return null
  if (raw.startsWith('http')) return raw
  if (raw.startsWith('File:')) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(raw.replace(/^File:/, ''))}?width=800`
  }
  return null
}

export async function searchNearbyPlaces(params: {
  lat: number
  lng: number
  category?: string
  radius?: number
  limit?: number
}): Promise<{ places: NearbyPlace[]; unavailable?: boolean; message?: string }> {
  const { lat, lng } = params
  const category = params.category || 'all'
  const radius = Math.min(30000, Math.max(300, params.radius || 6000))
  const limit = Math.min(60, Math.max(1, params.limit || 30))

  const cats = category === 'all' ? Object.keys(CATEGORY_QUERIES) : [category]
  const bodies: string[] = []
  for (const c of cats) {
    for (const q of CATEGORY_QUERIES[c] ?? []) bodies.push(`${q}(around:${radius},${lat},${lng});`)
  }
  if (bodies.length === 0) return { places: [], message: 'Unknown category.' }

  const query = `[out:json][timeout:15];(${bodies.join('')});out center tags ${limit * 3};`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ResourceFlowAI/1.0' },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    return { places: [], unavailable: true, message: 'Place search is temporarily unavailable. Please try again.' }
  }
  const data = await res.json()

  const places: NearbyPlace[] = (data.elements || [])
    .map((item: any) => {
      const pLat = item.lat ?? item.center?.lat
      const pLng = item.lon ?? item.center?.lon
      const tags = item.tags || {}
      if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) return null
      let matched: string | null = null
      if (tags.amenity === 'hospital') matched = 'hospital'
      else if (tags.amenity === 'clinic' || tags.amenity === 'doctors') matched = 'clinic'
      else if (tags.amenity === 'pharmacy') matched = 'pharmacy'
      else if (tags.amenity === 'police') matched = 'police'
      else if (tags.amenity === 'fire_station') matched = 'fire_station'
      else if (tags.emergency === 'ambulance_station' || tags.amenity === 'emergency_service') matched = 'ambulance'
      else if (tags.amenity === 'shelter' || tags.emergency === 'safe_place' || tags.amenity === 'refugee_site') matched = 'shelter'
      else if (tags.amenity === 'drinking_water' || tags.amenity === 'food_bank') matched = 'food_water'
      else if (tags.office === 'government' || tags.amenity === 'public_building') matched = 'government'
      if (!matched || !cats.includes(matched)) return null
      const name = tags.name || tags['name:en'] || null
      const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ')
      const area = [tags['addr:city'] || tags['addr:town'] || tags['addr:village'], tags['addr:postcode']].filter(Boolean).join(' ')
      const address = [street, area].filter((s) => s && s.trim() !== '').join(', ') || null
      return {
        id: `${item.type}/${item.id}`,
        osmType: item.type,
        osmId: item.id,
        name: name ?? 'Unnamed facility',
        category: matched,
        categoryLabel: CATEGORY_LABELS[matched] ?? 'Emergency Place',
        lat: pLat,
        lng: pLng,
        address,
        phone: tags.phone || tags['contact:phone'] || tags['emergency:phone'] || null,
        website: tags.website || tags['contact:website'] || null,
        openingHours: tags.opening_hours && tags.opening_hours.trim() !== '' ? tags.opening_hours : null,
        emergencyCapable: tags.emergency === 'yes' || tags['emergency:phone'] != null || matched === 'hospital' || matched === 'ambulance' || matched === 'fire_station',
        image: normalizeImageTag(tags),
        distanceKm: Math.round(haversineKm(lat, lng, pLat, pLng) * 100) / 100,
      }
    })
    .filter((p): p is NearbyPlace => p != null)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)

  return { places }
}
