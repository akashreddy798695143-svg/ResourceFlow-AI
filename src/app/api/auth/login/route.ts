import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, setSessionCookie, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { recordAudit } from '@/lib/events'

export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json())
    const { email, password } = body
    if (!email || !password) return err('Missing email or password', 422)

    const user = await db.user.findUnique({ where: { email: String(email).toLowerCase() } })
    if (!user) return err('Invalid credentials', 401)
    if (!user.active) return err('Account inactive — contact admin', 403)

    if (!user.passwordHash) return err('Invalid credentials', 401)
    const valid = await verifyPassword(user.passwordHash, String(password))
    if (!valid) return err('Invalid credentials', 401)

    await setSessionCookie({ id: user.id, email: user.email, name: user.name, role: user.role })
    await recordAudit({ userId: user.id, role: user.role, action: 'LOGIN', entityId: user.id, newState: user.role })
    return ok({ id: user.id, email: user.email, name: user.name, role: user.role })
  } catch (e) {
    return handleAuthError(e)
  }
}
