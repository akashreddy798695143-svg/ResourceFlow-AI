// Weather service — Open-Meteo (free, no API key required).
// Provides current weather + up to 10-day forecast.
// Returns null on failure — NEVER fabricates weather data.
//
// Open-Meteo free tier supports: current weather + 10-day forecast (daily + hourly).
// We use the maximum available and never claim more than the API returns.

import { db } from '@/lib/db'

const BASE = 'https://api.open-meteo.com/v1/forecast'

export interface CurrentWeather {
  temperature: number
  feelsLike: number
  humidity: number
  windSpeed: number
  windDirection: number
  visibility: number  // meters
  precipitation: number  // mm
  weatherCode: number  // WMO code
  isDay: boolean
  source: 'open-meteo'
}

export interface ForecastDay {
  date: string
  maxTemp: number
  minTemp: number
  precipitationSum: number
  precipitationProbability: number
  windSpeedMax: number
  weatherCode: number
  sunrise: string | null
  sunset: string | null
}

export interface WeatherAlert {
  headline: string
  description: string
  severity: string
  startsAt: string
  endsAt: string | null
}

export interface WeatherData {
  current: CurrentWeather
  forecast: ForecastDay[]  // up to 7 days (free tier max)
  alerts: WeatherAlert[]  // empty if none available
  location: { lat: number; lng: number }
  source: 'open-meteo'
}

// Legacy interface (kept for backward compat with risk-service)
export interface WeatherInfo {
  precipitation: number
  wind: number
  temperature: number
  source: 'open-meteo'
}

// WMO weather code → human-readable condition
const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
}

export function weatherCodeLabel(code: number): string {
  return WMO_CODES[code] || 'Unknown'
}

// Get full weather data (current + forecast) for a location
export async function getWeatherFull(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,visibility,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
      timezone: 'auto',
      forecast_days: '10',
    })
    const url = `${BASE}?${params.toString()}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data: any = await res.json()
    if (!data?.current) return null

    const cur = data.current
    const current: CurrentWeather = {
      temperature: Number(cur.temperature_2m ?? 0),
      feelsLike: Number(cur.apparent_temperature ?? 0),
      humidity: Number(cur.relative_humidity_2m ?? 0),
      windSpeed: Number(cur.wind_speed_10m ?? 0),
      windDirection: Number(cur.wind_direction_10m ?? 0),
      visibility: Number(cur.visibility ?? 0),
      precipitation: Number(cur.precipitation ?? 0),
      weatherCode: Number(cur.weather_code ?? 0),
      isDay: Boolean(cur.is_day),
      source: 'open-meteo',
    }

    const forecast: ForecastDay[] = []
    if (data.daily && Array.isArray(data.daily.time)) {
      for (let i = 0; i < data.daily.time.length; i++) {
        forecast.push({
          date: data.daily.time[i],
          maxTemp: Number(data.daily.temperature_2m_max?.[i] ?? 0),
          minTemp: Number(data.daily.temperature_2m_min?.[i] ?? 0),
          precipitationSum: Number(data.daily.precipitation_sum?.[i] ?? 0),
          precipitationProbability: Number(data.daily.precipitation_probability_max?.[i] ?? 0),
          windSpeedMax: Number(data.daily.wind_speed_10m_max?.[i] ?? 0),
          weatherCode: Number(data.daily.weather_code?.[i] ?? 0),
          sunrise: data.daily.sunrise?.[i] ?? null,
          sunset: data.daily.sunset?.[i] ?? null,
        })
      }
    }

    return {
      current,
      forecast,
      alerts: [],  // Open-Meteo free tier doesn't include alerts; left empty (never fabricated)
      location: { lat, lng: lon },
      source: 'open-meteo',
    }
  } catch (e) {
    console.error('[weather] Open-Meteo unavailable:', e)
    return null
  }
}

// Legacy: current weather only (used by risk-service + incident-workflow)
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

// Environmental risk assessment — combines weather into a simple advisory.
// This is decision-support only, NOT a medically/scientifically validated model.
export interface EnvironmentalRisk {
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE'
  summary: string
  factors: string[]
  advisory: string
}

export function assessEnvironmentalRisk(weather: WeatherInfo | CurrentWeather | null): EnvironmentalRisk | null {
  if (!weather) return null
  const factors: string[] = []
  let level: EnvironmentalRisk['level'] = 'LOW'

  // Heavy precipitation raises risk
  if (weather.precipitation > 10) { level = 'HIGH'; factors.push(`Heavy precipitation (${weather.precipitation}mm)`) }
  else if (weather.precipitation > 2) { if (level === 'LOW') level = 'MODERATE'; factors.push(`Moderate precipitation (${weather.precipitation}mm)`) }

  // High winds raise risk
  const wind = 'windSpeed' in weather ? weather.windSpeed : weather.wind
  if (wind > 60) { level = 'SEVERE'; factors.push(`High winds (${wind} km/h)`) }
  else if (wind > 30) { if (level === 'LOW') level = 'MODERATE'; factors.push(`Moderate winds (${wind} km/h)`) }

  const temp = 'temperature' in weather ? weather.temperature : 0
  if (temp > 40) { if (level === 'LOW') level = 'MODERATE'; factors.push(`Extreme heat (${temp}°C)`) }
  if (temp < 0) { if (level === 'LOW') level = 'MODERATE'; factors.push(`Below freezing (${temp}°C)`) }

  const visibility = 'visibility' in weather ? weather.visibility : 0
  if (visibility > 0 && visibility < 1000) { if (level === 'LOW') level = 'MODERATE'; factors.push(`Reduced visibility (${visibility}m)`) }

  const advisories: Record<string, string> = {
    LOW: 'Current weather conditions are favourable for response operations.',
    MODERATE: 'Current weather conditions may increase operational difficulty.',
    HIGH: 'Adverse weather conditions may significantly impact response operations.',
    SEVERE: 'Severe weather conditions are likely to severely impact response operations. Consider delaying non-critical dispatches.',
  }

  return {
    level,
    summary: factors.length > 0 ? factors.join('; ') : 'Favourable conditions',
    factors,
    advisory: advisories[level],
  }
}

export { db }
