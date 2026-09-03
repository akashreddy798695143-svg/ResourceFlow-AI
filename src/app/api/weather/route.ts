import { NextRequest } from 'next/server'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { getWeatherFull, assessEnvironmentalRisk, weatherCodeLabel } from '@/lib/services/weather-service'

// GET /api/weather?lat=27.7172&lng=85.324
// Returns current weather + 7-day forecast + environmental risk assessment.
// Uses the citizen's incident lat/lng — no manual city entry required.
// Server-side only — no API key is exposed (Open-Meteo free tier needs no key).
// Authenticated users only (prevents abuse).
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const lat = Number(searchParams.get('lat'))
    const lng = Number(searchParams.get('lng'))
    if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return err('Invalid lat/lng', 422)
    }

    const data = await getWeatherFull(lat, lng)
    if (!data) {
      return ok({ unavailable: true, message: 'Weather data unavailable — the weather service is not responding.' }, 200)
    }

    const envRisk = assessEnvironmentalRisk(data.current)

    return ok({
      current: {
        ...data.current,
        condition: weatherCodeLabel(data.current.weatherCode),
      },
      forecast: data.forecast.map((f) => ({ ...f, condition: weatherCodeLabel(f.weatherCode) })),
      alerts: data.alerts,
      environmentalRisk: envRisk,
      location: data.location,
      source: data.source,
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
