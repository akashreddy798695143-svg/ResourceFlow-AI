// Reverse geocoding service — converts lat/lng to a human-readable location name.
// Uses OpenStreetMap Nominatim (free, no API key) by default. Configurable via env:
//   REVERSE_GEOCODER_URL=https://nominatim.openstreetmap.org/reverse
//   REVERSE_GEOCODER_REFERER=resourceflow-ai (Nominatim requires a referer/user-agent)
//
// Never fabricates location names. On failure, returns null (the caller keeps lat/lng
// and displays "Location name unavailable"). Never blocks incident submission.

const DEFAULT_URL = 'https://nominatim.openstreetmap.org/reverse'

export interface LocationName {
  displayName: string  // e.g. "Kathmandu, Bagmati, Nepal"
  shortName: string    // e.g. "Kathmandu, Nepal"
  source: string
}

export async function reverseGeocode(lat: number, lng: number): Promise<LocationName | null> {
  const baseUrl = process.env.REVERSE_GEOCODER_URL || DEFAULT_URL
  const referer = process.env.REVERSE_GEOCODER_REFERER || 'resourceflow-ai-hackathon'
  try {
    const url = `${baseUrl}?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`
    const res = await fetch(url, {
      headers: {
        'User-Agent': referer,
        'Referer': referer,
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data: any = await res.json().catch(() => null)
    if (!data || !data.display_name) return null

    // Build a short name from address components (city, state, country)
    const addr = data.address || {}
    const city = addr.city || addr.town || addr.village || addr.county || addr.state_district || ''
    const state = addr.state || ''
    const country = addr.country || ''
    const parts = [city, state, country].filter(Boolean)
    const shortName = parts.length > 0 ? parts.join(', ') : String(data.display_name).split(',').slice(-2).join(',').trim()

    return {
      displayName: String(data.display_name),
      shortName: shortName || String(data.display_name),
      source: 'openstreetmap-nominatim',
    }
  } catch (e) {
    console.error('[geocode] reverse geocoding failed:', e)
    return null
  }
}
