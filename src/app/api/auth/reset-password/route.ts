import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handleAuthError, hashPassword } from '@/lib/auth'
import { err, ok, parseBody } from '@/lib/api'
import { verifyOtp } from '@/lib/services/otp-service'

export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json())
    const email = String(body?.email || '').trim().toLowerCase()
    const code = String(body?.code || '').trim()
    const password = String(body?.password || '')

    if (!email || !/^\d{6}$/.test(code)) return err('Enter the 6-digit code sent to your email.', 422)
    if (password.length < 6) return err('Password must be at least 6 characters.', 422)

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !user.active) return err('Unable to reset password.', 400)

    const verification = await verifyOtp({ identifier: email, purpose: 'PASSWORD_RESET', code })
    if (!verification.ok || verification.userId !== user.id) {
      return err(verification.error || 'Invalid or expired reset code.', 400)
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    })

    return ok({ message: 'Password reset successfully. You can now sign in.' })
  } catch (e) {
    return handleAuthError(e)
  }
}
