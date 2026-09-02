import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { generateOtp } from '@/lib/services/otp-service'
import { sendSms, isValidPhone } from '@/lib/services/sms-service'
import { sendEmail } from '@/lib/services/email-service'

// POST /api/auth/resend-otp
// Resend the OTP — respects the 60s resend cooldown.
export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json())
    const { userId, phone } = body
    if (!userId || !phone) return err('Missing required fields: userId, phone', 422)
    const phoneStr = String(phone).replace(/[\s()-]/g, '')
    if (!isValidPhone(phoneStr)) return err('Invalid phone number', 422)

    // Verify the user exists and isn't already verified
    const user = await db.user.findUnique({ where: { id: String(userId) } })
    if (!user) return err('User not found', 404)
    if (user.active) return err('Account is already verified', 422)

    const result = await generateOtp({
      identifier: phoneStr,
      channel: 'SMS',
      purpose: 'REGISTRATION',
      userId: user.id,
    })
    if (!result.ok || !result.code) {
      return err(result.error || 'Failed to generate OTP', 429, {
        resendCooldownUntil: result.resendCooldownUntil,
      })
    }

    // Send via SMS
    const smsText = `RESOURCEFLOW AI: Your verification code is ${result.code}. It expires in 5 minutes.`
    const smsRes = await sendSms(phoneStr, smsText)
    // Also send via email (backup channel)
    const otpEmailHtml = `<!DOCTYPE html><html><body style="font-family:sans-serif"><div style="max-width:560px;margin:24px auto;background:white;border-radius:8px;overflow:hidden"><div style="background:#1a1d23;padding:24px;color:#f5f5f5;font-weight:bold">RESOURCEFLOW AI — Your Verification Code</div><div style="padding:28px"><p>Hello ${user.name},</p><p>Your new verification code is:</p><div style="text-align:center;margin:24px 0"><div style="display:inline-block;background:#f59e0b;color:#1a1d23;font-size:32px;font-weight:bold;letter-spacing:8px;padding:14px 24px;border-radius:8px;font-family:monospace">${result.code}</div></div><p style="color:#6b7280;font-size:12px">Expires in 5 minutes. Do not share.</p></div></div></body></html>`
    const emailRes = await sendEmail({ to: user.email, subject: 'RESOURCEFLOW AI – Your Verification Code (Resent)', html: otpEmailHtml })

    return ok({
      otpExpiresAt: result.expiresAt,
      smsSent: smsRes.ok,
      emailSent: emailRes.ok,
      message: 'OTP resent to your phone and email.',
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
