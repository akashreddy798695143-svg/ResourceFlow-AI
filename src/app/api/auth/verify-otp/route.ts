import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { setSessionCookie, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { verifyOtp } from '@/lib/services/otp-service'
import { sendEmail } from '@/lib/services/email-service'
import { renderRegistrationEmail } from '@/lib/services/email-templates'
import { dispatchNotification, getUserRecipient } from '@/lib/services/notification-service'
import { recordAudit } from '@/lib/events'

// POST /api/auth/verify-otp
// Email-only OTP verification. Verifies the email OTP and activates the account.
export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json())
    const { userId, email, code } = body
    if (!userId || !email || !code) {
      return err('Missing required fields: userId, email, code', 422)
    }
    const emailLower = String(email).toLowerCase()

    // Verify the OTP (argon2 hash compare, expiry check, attempt limit, single-use)
    const result = await verifyOtp({
      identifier: emailLower,
      purpose: 'REGISTRATION',
      code: String(code),
    })
    if (!result.ok) {
      return err(result.error || 'OTP verification failed', 422, {
        remainingAttempts: result.remainingAttempts,
      })
    }

    // Mark email verified + activate the account
    const user = await db.user.update({
      where: { id: String(userId) },
      data: { emailVerified: true, phoneVerified: true, active: true },
    })

    await setSessionCookie({ id: user.id, email: user.email, name: user.name, role: user.role })
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'REGISTER_VERIFIED',
      entityId: user.id,
      newState: 'ACTIVE',
      reason: 'Email OTP verified — account activated',
    })

    // Send registration confirmation email
    const { subject, html } = renderRegistrationEmail({ name: user.name, email: user.email, role: user.role })
    const emailRes = await sendEmail({ to: user.email, subject, html })

    // In-app notification
    const recipient = await getUserRecipient(user.id)
    if (recipient) {
      await dispatchNotification('REGISTRATION_VERIFIED', [recipient], {
        title: 'Registration Successful',
        message: 'Your account has been verified successfully.',
      })
    }

    return ok({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      activated: true,
      emailVerified: true,
      emailSent: emailRes.ok,
      message: 'Account activated successfully.',
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
