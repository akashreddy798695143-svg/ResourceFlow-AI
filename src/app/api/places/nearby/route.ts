import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { searchNearbyPlaces } from '@/lib/features/nearby-places'

// Citizen Nearby Help — real place search via OpenStreetMap Overpass
// (the same open provider the existing /api/emergency-services route uses).
// See src/lib/features/nearby-places.ts for the shared implementation.
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const lat = Number(searchParams.get('lat'))
    const lng = Number(searchParams.get('lng'))
    const category = searchParams.get('category') || 'all'
    const radius = Number(searchParams.get('radius') || 6000)
    const limit = Number(searchParams.get('limit') || 30)

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return err('Invalid coordinates', 422)
    }

    const result = await searchNearbyPlaces({ lat, lng, category, radius, limit })
    return ok({ ...result, source: 'OpenStreetMap Overpass', reference: { lat, lng } })
  } catch (e) {
    return handleAuthError(e)
  }
}
