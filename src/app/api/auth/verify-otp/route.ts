import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { setSessionCookie, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { verifyOtp } from '@/lib/services/otp-service'
import { sendEmail } from '@/lib/services/email-service'
import { sendSms } from '@/lib/services/sms-service'
import { renderRegistrationEmail } from '@/lib/services/email-templates'
import { dispatchNotification, getUserRecipient } from '@/lib/services/notification-service'
import { recordAudit, recordIncidentEvent } from '@/lib/events'

// POST /api/auth/verify-otp
// Stage 2 of OTP-based registration: verify the OTP code, activate the account,
// send registration confirmation SMS + email, and log the user in.
export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json())
    const { userId, phone, code } = body
    if (!userId || !phone || !code) return err('Missing required fields: userId, phone, code', 422)
    const phoneStr = String(phone).replace(/[\s()-]/g, '')

    // Verify the OTP (argon2 hash compare, expiry check, attempt limit, single-use)
    const result = await verifyOtp({
      identifier: phoneStr,
      purpose: 'REGISTRATION',
      code: String(code),
    })
    if (!result.ok) {
      return err(result.error || 'OTP verification failed', 422, {
        remainingAttempts: result.remainingAttempts,
      })
    }

    // Activate the account
    const user = await db.user.update({
      where: { id: String(userId) },
      data: { active: true, phoneVerified: true, emailVerified: true },
    })

    await setSessionCookie({ id: user.id, email: user.email, name: user.name, role: user.role })
    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'REGISTER_VERIFIED',
      entityId: user.id,
      newState: 'ACTIVE',
      reason: 'OTP verified — account activated',
    })

    // Send registration confirmation SMS
    const smsText = `RESOURCEFLOW AI registration successful. Your account has been verified successfully.`
    const smsRes = await sendSms(phoneStr, smsText)
    // Send registration confirmation email
    const { subject, html } = renderRegistrationEmail({ name: user.name, email: user.email, role: user.role })
    const emailRes = await sendEmail({ to: user.email, subject, html })

    // Multi-channel in-app notification (REGISTRATION_VERIFIED)
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
      verified: true,
      smsSent: smsRes.ok,
      emailSent: emailRes.ok,
      message: 'Account activated successfully.',
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
