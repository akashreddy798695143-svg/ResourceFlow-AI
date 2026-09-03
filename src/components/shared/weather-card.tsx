'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiGet } from '@/lib/api-client'
import {
  CloudRain, Wind, Droplets, Eye, Thermometer, Sun, Sunrise, Sunset,
  AlertTriangle, Loader2, Cloud, CloudSun,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface WeatherResponse {
  unavailable?: boolean
  message?: string
  current?: {
    temperature: number
    feelsLike: number
    humidity: number
    windSpeed: number
    windDirection: number
    visibility: number
    precipitation: number
    weatherCode: number
    condition: string
    isDay: boolean
  }
  forecast?: Array<{
    date: string
    maxTemp: number
    minTemp: number
    precipitationSum: number
    precipitationProbability: number
    windSpeedMax: number
    weatherCode: number
    condition: string
  }>
  environmentalRisk?: {
    level: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE'
    summary: string
    factors: string[]
    advisory: string
  }
}

const RISK_STYLES: Record<string, string> = {
  LOW: 'text-sev-LOW border-sev-LOW bg-sev-LOW/10',
  MODERATE: 'text-sev-MEDIUM border-sev-MEDIUM bg-sev-MEDIUM/10',
  HIGH: 'text-sev-HIGH border-sev-HIGH bg-sev-HIGH/10',
  SEVERE: 'text-sev-CRITICAL border-sev-CRITICAL bg-sev-CRITICAL/10',
}

export function WeatherCard({ lat, lng, compact = false }: { lat: number; lng: number; compact?: boolean }) {
  const [data, setData] = useState<WeatherResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await apiGet<WeatherResponse>(`/api/weather?lat=${lat}&lng=${lng}`)
      setData(res)
    } catch {
      setData({ unavailable: true, message: 'Weather data unavailable' })
    } finally {
      setLoading(false)
    }
  }, [lat, lng])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2 border-b border-border">
          <CardTitle className="text-sm flex items-center gap-2"><Cloud className="h-4 w-4 text-primary" /> Current Weather</CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (data?.unavailable) {
    return (
      <Card>
        <CardHeader className="pb-2 border-b border-border">
          <CardTitle className="text-sm flex items-center gap-2"><Cloud className="h-4 w-4 text-primary" /> Current Weather</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{data.message}</p>
        </CardContent>
      </Card>
    )
  }

  if (!data?.current) return null

  const c = data.current

  return (
    <Card>
      <CardHeader className="pb-2 border-b border-border">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cloud className="h-4 w-4 text-primary" /> Environmental Conditions
          {data.environmentalRisk && (
            <Badge variant="outline" className={cn('text-[9px] ml-auto', RISK_STYLES[data.environmentalRisk.level])}>
              {data.environmentalRisk.level} RISK
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Current weather */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <Thermometer className="h-8 w-8 text-primary mb-1" />
            <span className="text-2xl font-bold tabular-nums">{c.temperature.toFixed(0)}°C</span>
            <span className="text-[10px] text-muted-foreground">{c.condition}</span>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-2 text-xs">
            <Metric icon={Thermometer} label="Feels like" value={`${c.feelsLike.toFixed(0)}°C`} />
            <Metric icon={Droplets} label="Humidity" value={`${c.humidity.toFixed(0)}%`} />
            <Metric icon={Wind} label="Wind" value={`${c.windSpeed.toFixed(0)} km/h`} />
            <Metric icon={Eye} label="Visibility" value={c.visibility > 0 ? `${(c.visibility / 1000).toFixed(1)} km` : '—'} />
            <Metric icon={CloudRain} label="Precipitation" value={`${c.precipitation.toFixed(1)} mm`} />
            <Metric icon={Wind} label="Wind dir" value={`${c.windDirection.toFixed(0)}°`} />
          </div>
        </div>

        {/* Environmental risk advisory */}
        {data.environmentalRisk && (
          <div className={cn('rounded-md border p-3', RISK_STYLES[data.environmentalRisk.level])}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium">{data.environmentalRisk.advisory}</p>
                {data.environmentalRisk.factors.length > 0 && (
                  <p className="text-[11px] mt-1 opacity-80">{data.environmentalRisk.summary}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Forecast (hide in compact mode) */}
        {!compact && data.forecast && data.forecast.length > 1 && (
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">Forecast ({data.forecast.length} days)</p>
            <div className="flex gap-2 overflow-x-auto rf-scroll pb-2">
              {data.forecast.map((f, i) => (
                <div key={f.date} className="shrink-0 w-24 rounded-md border border-border bg-card/40 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">
                    {i === 0 ? 'Today' : new Date(f.date).toLocaleDateString('en', { weekday: 'short' })}
                  </p>
                  <CloudSun className="h-5 w-5 mx-auto my-1 text-primary" />
                  <p className="text-xs font-medium">{f.maxTemp.toFixed(0)}°/{f.minTemp.toFixed(0)}°</p>
                  <p className="text-[10px] text-muted-foreground">{f.condition.slice(0, 14)}</p>
                  <p className="text-[10px] text-primary flex items-center justify-center gap-0.5 mt-1">
                    <Droplets className="h-2.5 w-2.5" /> {f.precipitationProbability}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
