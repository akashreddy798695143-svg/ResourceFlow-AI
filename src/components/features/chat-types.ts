// Chat feature types
import type { Role } from '@/lib/types'

export interface ChatMessage {
  id: string
  kind: string
  body: string | null
  latitude?: number | null
  longitude?: number | null
  accuracy?: number | null
  photoUrl?: string | null
  photoMime?: string | null
  photoName?: string | null
  incidentId?: string | null
  incidentTitle?: string | null
  locationLabel?: string | null
  readAt: string | null
  createdAt: string
  senderId: string
  sender: { id: string; name: string; role: Role }
}

export interface ChatPreview {
  kind: string
  text: string
  senderId: string
  createdAt: string
  readAt: string | null
}

export interface Conversation {
  id: string
  participantId: string | null
  participantName: string
  participantRole: Role
  participantEmail: string | null
  participantPhone: string | null
  lastMessage: ChatPreview | null
  lastAt: string
  unread: number
}

export interface Recipient {
  id: string
  name: string
  email: string
  phone: string | null
  role: Role
  createdAt: string
}

export type MessageKind = 'TEXT' | 'LOCATION' | 'INCIDENT_LOCATION' | 'IMAGE'