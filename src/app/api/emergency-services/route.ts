import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const lat = Number(searchParams.get('lat'))
    const lng = Number(searchParams.get('lng'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return err('Invalid coordinates', 422)
    }

    const query = `[out:json][timeout:8];(nwr[amenity~"^(hospital|clinic|pharmacy)$"](around:10000,${lat},${lng});nwr[emergency=ambulance_station](around:10000,${lat},${lng}););out center tags;`
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ResourceFlowAI/1.0' },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return ok({ services: [], unavailable: true, message: 'Nearby services are temporarily unavailable.' })

    const data = await response.json()
    const services = (data.elements || []).map((item: any) => {
      const itemLat = item.lat ?? item.center?.lat
      const itemLng = item.lon ?? item.center?.lon
      const tags = item.tags || {}
      return {
        id: String(item.id),
        name: tags.name || tags['name:en'] || 'Emergency service',
        type: tags.amenity === 'hospital' ? 'Hospital' : tags.amenity === 'pharmacy' ? 'Pharmacy' : 'Clinic / ambulance station',
        phone: tags.phone || tags['contact:phone'] || null,
        lat: itemLat,
        lng: itemLng,
      }
    }).filter((service: any) => Number.isFinite(service.lat) && Number.isFinite(service.lng)).slice(0, 30)

    return ok({ services, source: 'OpenStreetMap Overpass' })
  } catch (e) {
    return handleAuthError(e)
  }
}
