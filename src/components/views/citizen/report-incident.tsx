'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { useAuth } from '@/lib/use-auth'
import { apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import { Loader2, Upload, MapPin, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const INCIDENT_TYPES = [
  { value: 'FLOOD', label: 'Flood' },
  { value: 'CYCLONE', label: 'Cyclone' },
  { value: 'EARTHQUAKE', label: 'Earthquake' },
  { value: 'LANDSLIDE', label: 'Landslide' },
  { value: 'ROAD_BLOCKAGE', label: 'Road Blockage' },
  { value: 'FIRE', label: 'Fire' },
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'INFRASTRUCTURE', label: 'Infrastructure' },
  { value: 'OTHER', label: 'Other' },
]

// Default demo location (New Delhi)
const DEFAULT_LOCATION = { name: 'New Delhi, India', lat: 28.6139, lng: 77.209 }

export function ReportIncidentView() {
  const { navigate } = useRouter()
  const { user } = useAuth()
  const [type, setType] = useState('FLOOD')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState(DEFAULT_LOCATION.name)
  const [lat, setLat] = useState(String(DEFAULT_LOCATION.lat))
  const [lng, setLng] = useState(String(DEFAULT_LOCATION.lng))
  const [imageMeta, setImageMeta] = useState<{ filename?: string; size?: number; contentType?: string } | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) {
      toast.error('Only JPEG, PNG, WebP, GIF allowed')
      e.target.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large (max 10MB)')
      e.target.value = ''
      return
    }
    setImageMeta({ filename: file.name, size: file.size, contentType: file.type })
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (description.trim().length < 5) return toast.error('Describe the incident in at least 5 characters')
    const latitude = Number(lat), longitude = Number(lng)
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return toast.error('Invalid coordinates')
    setLoading(true)
    try {
      const res = await apiPost<{ incidentCode: string; id: string }>('/api/incidents', {
        incidentType: type,
        description: description.trim(),
        location,
        latitude,
        longitude,
        imageMeta,
      })
      toast.success(`Report received: ${res.incidentCode}`, {
        description: 'AI analysis started. Track status with your incident code.',
      })
      navigate(user?.role === 'CITIZEN' ? '/citizen-dashboard' : `/incidents/${res.id}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Report an Incident</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your report will be analysed by the AI incident agent, clustered with related reports, and routed to a disaster officer for resource assignment.
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="type">Incident type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description" required minLength={5}
                value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you see: severity, people affected, road conditions, urgent needs…"
                rows={5}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input id="location" required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Riverside District, Sector 7" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lat">Latitude</Label>
                <Input id="lat" type="number" step="any" required value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lng">Longitude</Label>
                <Input id="lng" type="number" step="any" required value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Default coordinates: New Delhi. Adjust to the actual incident location.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="image">Optional image</Label>
              <div className="flex items-center gap-3">
                <label htmlFor="image" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border hover:bg-accent/40 transition text-sm">
                    <Upload className="h-4 w-4" />
                    {imageMeta ? imageMeta.filename : 'Choose image'}
                  </div>
                  <input id="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onFile} className="hidden" />
                </label>
                {imageMeta && (
                  <span className="text-xs text-muted-foreground">
                    {(imageMeta.size! / 1024).toFixed(0)} KB · {imageMeta.contentType}
                  </span>
                )}
              </div>
              {imagePreview && (
                <img src={imagePreview} alt="preview" className="mt-2 max-h-40 rounded-md border border-border" />
              )}
            </div>

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? 'Submitting…' : 'Submit Report'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
