'use client'

import { useState } from 'react'
import { Hospital, Loader2, MapPin, Phone, RefreshCw } from 'lucide-react'
import { apiGet } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Service = { id: string; name: string; type: string; phone: string | null; lat: number; lng: number }

export function EmergencyServices({ lat, lng }: { lat: number; lng: number }) {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const findServices = async () => {
    setLoading(true)
    try {
      const result = await apiGet<{ services: Service[] }>(`/api/emergency-services?lat=${lat}&lng=${lng}`)
      setServices(result.services)
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2 border-b border-border">
        <CardTitle className="text-sm flex items-center gap-2"><Hospital className="h-4 w-4 text-primary" /> Nearby emergency services</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {!loaded ? (
          <Button variant="outline" size="sm" onClick={findServices} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
            Find hospitals and services
          </Button>
        ) : services.length === 0 ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>No nearby services found.</span><Button variant="ghost" size="sm" onClick={findServices}><RefreshCw className="h-3.5 w-3.5" /></Button></div>
        ) : (
          <div className="space-y-2">
            {services.slice(0, 6).map((service) => (
              <div key={service.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                <Hospital className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{service.name}</p><p className="text-[10px] text-muted-foreground">{service.type}</p></div>
                {service.phone && <a className="text-primary" href={`tel:${service.phone}`} aria-label={`Call ${service.name}`}><Phone className="h-3.5 w-3.5" /></a>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
