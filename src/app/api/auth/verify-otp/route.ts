import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { setSessionCookie, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { verifyOtp } from '@/lib/services/otp-service'
import { sendEmail } from '@/lib/services/email-service'
import { sendSms } from '@/lib/services/sms-service'
import { renderRegistrationEmail } from '@/lib/services/email-templates'
import { dispatchNotification, getUserRecipient } from '@/lib/services/notification-service'
import { recordAudit } from '@/lib/events'

// POST /api/auth/verify-otp
// Stage 2 of dual-OTP registration. Verifies OTPs one at a time:
//   - First call with channel=SMS verifies the phone OTP → sets phoneVerified=true
//   - Second call with channel=EMAIL verifies the email OTP → sets emailVerified=true + activates account
// Returns { activated: true } only when BOTH are verified.
export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json())
    const { userId, identifier, code, channel } = body
    // identifier is the phone (for SMS) or email (for EMAIL)
    if (!userId || !identifier || !code || !channel) {
      return err('Missing required fields: userId, identifier, code, channel', 422)
    }
    const channelNorm = String(channel).toUpperCase()
    if (!['SMS', 'EMAIL'].includes(channelNorm)) return err('Invalid channel', 422)
    const identifierNorm = String(identifier).replace(/[\s()-]/g, '')

    // Verify the OTP (argon2 hash compare, expiry check, attempt limit, single-use)
    const result = await verifyOtp({
      identifier: identifierNorm,
      purpose: 'REGISTRATION',
      code: String(code),
    })
    if (!result.ok) {
      return err(result.error || 'OTP verification failed', 422, {
        remainingAttempts: result.remainingAttempts,
      })
    }

    // Mark the corresponding channel as verified
    const updateData: any = {}
    if (channelNorm === 'SMS') updateData.phoneVerified = true
    else updateData.emailVerified = true

    const user = await db.user.update({
      where: { id: String(userId) },
      data: updateData,
    })

    // Check if BOTH are verified → activate the account
    if (user.phoneVerified && user.emailVerified && !user.active) {
      const activatedUser = await db.user.update({
        where: { id: user.id },
        data: { active: true },
      })

      await setSessionCookie({ id: activatedUser.id, email: activatedUser.email, name: activatedUser.name, role: activatedUser.role })
      await recordAudit({
        userId: activatedUser.id,
        role: activatedUser.role,
        action: 'REGISTER_VERIFIED',
        entityId: activatedUser.id,
        newState: 'ACTIVE',
        reason: 'Both phone + email OTP verified — account activated',
      })

      // Send registration confirmation SMS + email
      if (activatedUser.phone) {
        const smsText = `RESOURCEFLOW AI registration successful. Your account has been verified successfully.`
        await sendSms(activatedUser.phone, smsText)
      }
      const { subject, html } = renderRegistrationEmail({ name: activatedUser.name, email: activatedUser.email, role: activatedUser.role })
      await sendEmail({ to: activatedUser.email, subject, html })

      // In-app notification
      const recipient = await getUserRecipient(activatedUser.id)
      if (recipient) {
        await dispatchNotification('REGISTRATION_VERIFIED', [recipient], {
          title: 'Registration Successful',
          message: 'Your account has been verified successfully.',
        })
      }

      return ok({
        id: activatedUser.id,
        email: activatedUser.email,
        name: activatedUser.name,
        role: activatedUser.role,
        activated: true,
        phoneVerified: true,
        emailVerified: true,
        message: 'Account activated successfully.',
      })
    }

    // Only one channel verified — return the partial state
    return ok({
      userId: user.id,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      activated: false,
      message: channelNorm === 'SMS' ? 'Phone verified. Now verify your email.' : 'Email verified. Now verify your phone.',
      nextChannel: user.phoneVerified ? 'EMAIL' : 'SMS',
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
