'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import type { Incident, Resource } from '@/lib/types'

// react-leaflet accesses window at import time — must be client-only (no SSR).
const CommandMapInner = dynamic(
  () => import('./command-map-inner').then((m) => m.CommandMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center map-tile-bg text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    ),
  }
)

export function CommandMap(props: {
  incidents: Incident[]
  resources: Resource[]
  selectedIncident: string | null
  onSelectIncident: (id: string) => void
  onOpenIncident: (id: string) => void
  fullscreenEnabled?: boolean
}) {
  const [fullscreen, setFullscreen] = useState(false)
  return (
    <CommandMapInner
      {...props}
      fullscreen={fullscreen}
      onToggleFullscreen={props.fullscreenEnabled !== false ? () => setFullscreen((v) => !v) : undefined}
    />
  )
}
