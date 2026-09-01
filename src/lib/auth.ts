import argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import type { Role } from '@prisma/client'

const JWT_SECRET = process.env.JWT_SECRET || 'resourceflow-dev-secret-change-me'
const TOKEN_COOKIE = 'rf_session'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: Role
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id })
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

export function signToken(user: SessionUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

export function verifyToken(token: string): SessionUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role as Role,
    }
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(TOKEN_COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
}

export async function setSessionCookie(user: SessionUser) {
  const store = await cookies()
  const token = signToken(user)
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(TOKEN_COOKIE)
}

export function getTokenCookieName() {
  return TOKEN_COOKIE
}

// RBAC helper: require a session and (optionally) one of the allowed roles.
export async function requireAuth(allowedRoles?: Role[]): Promise<SessionUser> {
  const session = await getSession()
  if (!session) {
    throw new AuthError('Unauthorized — authentication required', 401)
  }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new AuthError('Forbidden — insufficient role', 403)
  }
  // Confirm the user still exists / is active in DB (never trust token alone for role checks)
  const dbUser = await db.user.findUnique({ where: { id: session.id } })
  if (!dbUser || !dbUser.active) {
    throw new AuthError('Unauthorized — user not found or inactive', 401)
  }
  // Use the DB role as source of truth
  return { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role }
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Standardised handler for AuthError / generic errors in route handlers.
export function handleAuthError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status })
  }
  return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 500 })
}

export function roleAllows(action: string, role: Role): boolean {
  const matrix: Record<string, Role[]> = {
    'incident:create': ['CITIZEN', 'DISASTER_OFFICER', 'ADMIN'],
    'incident:read': ['CITIZEN', 'RESPONDER', 'DISASTER_OFFICER', 'ADMIN'],
    'incident:update_status': ['RESPONDER', 'DISASTER_OFFICER', 'ADMIN'],
    'incident:resolve': ['DISASTER_OFFICER', 'ADMIN'],
    'incident:escalate': ['DISASTER_OFFICER', 'ADMIN'],
    'resource:read': ['CITIZEN', 'RESPONDER', 'DISASTER_OFFICER', 'ADMIN'],
    'resource:create': ['ADMIN'],
    'resource:update': ['ADMIN', 'DISASTER_OFFICER'],
    'resource:update_status': ['RESPONDER', 'ADMIN', 'DISASTER_OFFICER'],
    'approval:read': ['DISASTER_OFFICER', 'ADMIN'],
    'approval:decide': ['DISASTER_OFFICER', 'ADMIN'],
    'simulation:run': ['DISASTER_OFFICER', 'ADMIN', 'CITIZEN'],
    'analytics:read': ['DISASTER_OFFICER', 'ADMIN'],
    'audit:read': ['ADMIN'],
    'user:manage': ['ADMIN'],
  }
  return (matrix[action] || []).includes(role)
}
