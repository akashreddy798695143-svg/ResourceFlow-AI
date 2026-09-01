// Weather service — Open-Meteo. Returns null if API fails (never fabricates).
import { db } from '@/lib/db'

const BASE = 'https://api.open-meteo.com/v1/forecast'

export interface WeatherInfo {
  precipitation: number
  wind: number
  temperature: number
  source: 'open-meteo'
}

export async function getWeather(lat: number, lon: number): Promise<WeatherInfo | null> {
  try {
    const url = `${BASE}?latitude=${lat}&longitude=${lon}&current=precipitation,wind_speed_10m,temperature_2m`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const data = await res.json()
    const cur = data?.current
    if (!cur) return null
    return {
      precipitation: Number(cur.precipitation ?? 0),
      wind: Number(cur.wind_speed_10m ?? 0),
      temperature: Number(cur.temperature_2m ?? 0),
      source: 'open-meteo',
    }
  } catch (e) {
    console.error('[weather] Open-Meteo unavailable:', e)
    return null
  }
}

// Tiny in-memory cache (60s) keyed by rounded coords to avoid hammering the API.
const cache = new Map<string, { t: number; v: WeatherInfo | null }>()
export async function getWeatherCached(lat: number, lon: number): Promise<WeatherInfo | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.t < 60000) return hit.v
  const v = await getWeather(lat, lon)
  cache.set(key, { t: Date.now(), v })
  return v
}

// Re-export db so this module mirrors the backend service layout
export { db }
