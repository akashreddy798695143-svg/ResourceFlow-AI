import { db } from '@/lib/db'
import type { Role } from '@prisma/client'

// Secure 1:1 in-app chat.
// Sender/receiver relationship matrix — the ONLY flows allowed (server-enforced.
//   Citizens (incl. registered volunteers) ↔ Officer / Admin / Responder
//   Officers / Admins / Responders ↔ Citizens (incl. volunteers)
// Internal staff may also coordinate with each other as needed by the workflows.
export const CHAT_ALLOWED_TARGETS: Record<Role, Role[]> = {
  CITIZEN: ['DISASTER_OFFICER', 'ADMIN', 'RESPONDER'],
  RESPONDER: ['DISASTER_OFFICER', 'ADMIN', 'CITIZEN'],
  DISASTER_OFFICER: ['ADMIN', 'RESPONDER', 'CITIZEN'],
  ADMIN: ['DISASTER_OFFICER', 'RESPONDER', 'CITIZEN'],
}

export function canMessage(sender: Role, recipient: Role): boolean {
  return (CHAT_ALLOWED_TARGETS[sender] || []).includes(recipient)
}

// Normalize participant ids so (A,B) is stored canonically (A < B).
export function normalizeParticipants(a: string, b: string): { participantA: string; participantB: string } {
  const [participantA, participantB] = [a, b].sort()
  return { participantA, participantB }
}

// Fetch or create the 1:1 conversation between two users.
export async function getOrCreateConversation(a: string, b: string) {
  const { participantA, participantB } = normalizeParticipants(a, b)
  return db.chatConversation.upsert({
    where: { participantA_participantB: { participantA, participantB } },
    update: {},
    create: { participantA, participantB },
  })
}

export function participantIn(conversation: { participantA: string; participantB: string }, userId: string): boolean {
  return conversation.participantA === userId || conversation.participantB === userId
}

// The other participant id in a conversation.
export function otherParticipant(conversation: { participantA: string; participantB: string }, userId: string): string {
  return conversation.participantA === userId ? conversation.participantB : conversation.participantA
}