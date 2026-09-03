import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { reverseGeocode } from '@/lib/services/geocode-service'

// GET /api/geocode/reverse?lat=27.7172&lng=85.324
// Returns { displayName, shortName, source } or { error: 'unavailable' } if reverse geocoding fails.
// Never fabricates location names. Authenticated users only (prevents abuse).
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const lat = Number(searchParams.get('lat'))
    const lng = Number(searchParams.get('lng'))
    if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return err('Invalid lat/lng', 422)
    }
    const result = await reverseGeocode(lat, lng)
    if (!result) return ok({ unavailable: true, message: 'Location name unavailable' }, 200)
    return ok(result)
  } catch (e) {
    return handleAuthError(e)
  }
}
