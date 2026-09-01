import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, setSessionCookie, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { recordAudit } from '@/lib/events'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = ['CITIZEN', 'RESPONDER', 'DISASTER_OFFICER', 'ADMIN']

export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json())
    const { email, password, name, role } = body
    if (!email || !password || !name) return err('Missing required fields: email, password, name', 422)
    if (password.length < 6) return err('Password must be at least 6 characters', 422)
    const roleNorm = (String(role || 'CITIZEN').toUpperCase()) as Role
    if (!ALLOWED_ROLES.includes(roleNorm)) return err('Invalid role', 422)

    const existing = await db.user.findUnique({ where: { email: String(email).toLowerCase() } })
    if (existing) return err('Email already registered', 409)

    const user = await db.user.create({
      data: {
        email: String(email).toLowerCase(),
        name: String(name),
        passwordHash: await hashPassword(String(password)),
        role: roleNorm,
      },
    })
    await setSessionCookie({ id: user.id, email: user.email, name: user.name, role: user.role })
    await recordAudit({ userId: user.id, role: user.role, action: 'REGISTER', entityId: user.id, newState: user.role })
    return ok({ id: user.id, email: user.email, name: user.name, role: user.role }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}
