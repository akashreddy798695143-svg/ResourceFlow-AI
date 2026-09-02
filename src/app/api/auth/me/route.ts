import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'

export async function GET() {
  try {
    const user = await requireAuth()
    return ok({ id: user.id, email: user.email, name: user.name, role: user.role })
  } catch (e) {
    return handleAuthError(e)
  }
}
