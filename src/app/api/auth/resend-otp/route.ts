import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { generateOtp } from '@/lib/services/otp-service'
import { sendSms, isValidPhone } from '@/lib/services/sms-service'
import { sendEmail } from '@/lib/services/email-service'

// POST /api/auth/resend-otp
// Resend the OTP for a specific channel — respects the 60s resend cooldown.
// Body: { userId, identifier, channel: 'SMS' | 'EMAIL' }
export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json())
    const { userId, identifier, channel } = body
    if (!userId || !identifier || !channel) return err('Missing required fields: userId, identifier, channel', 422)
    const channelNorm = String(channel).toUpperCase()
    if (!['SMS', 'EMAIL'].includes(channelNorm)) return err('Invalid channel', 422)
    const identifierNorm = String(identifier).replace(/[\s()-]/g, '')

    // Verify the user exists and isn't already verified for this channel
    const user = await db.user.findUnique({ where: { id: String(userId) } })
    if (!user) return err('User not found', 404)
    if (user.active) return err('Account is already verified', 422)
    if (channelNorm === 'SMS' && user.phoneVerified) return err('Phone is already verified', 422)
    if (channelNorm === 'EMAIL' && user.emailVerified) return err('Email is already verified', 422)

    const result = await generateOtp({
      identifier: identifierNorm,
      channel: channelNorm as any,
      purpose: 'REGISTRATION',
      userId: user.id,
    })
    if (!result.ok || !result.code) {
      return err(result.error || 'Failed to generate OTP', 429, {
        resendCooldownUntil: result.resendCooldownUntil,
      })
    }

    let sent = false
    let error: string | undefined
    if (channelNorm === 'SMS') {
      if (!isValidPhone(identifierNorm)) return err('Invalid phone number', 422)
      const smsText = `RESOURCEFLOW AI: Your verification code is ${result.code}. It expires in 5 minutes.`
      const res = await sendSms(identifierNorm, smsText)
      sent = res.ok
      error = res.error
    } else {
      const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif"><div style="max-width:560px;margin:24px auto;background:white;border-radius:8px;overflow:hidden"><div style="background:linear-gradient(135deg,#1a1d23 0%,#0f1115 100%);padding:24px 28px;border-radius:8px 8px 0 0;border-bottom:3px solid #f59e0b"><div style="color:#f5f5f5;font-size:18px;font-weight:bold">RESOURCEFLOW AI</div><div style="color:#9ca3af;font-size:11px;letter-spacing:1px;text-transform:uppercase">Email Verification (Resent)</div></div><div style="padding:28px"><p style="color:#374151;font-size:15px">Hello ${user.name},</p><p style="color:#374151;font-size:15px">Your new verification code is:</p><div style="text-align:center;margin:24px 0"><div style="display:inline-block;background:#f59e0b;color:#1a1d23;font-size:32px;font-weight:bold;letter-spacing:8px;padding:14px 24px;border-radius:8px;font-family:monospace">${result.code}</div></div><p style="color:#6b7280;font-size:12px">Expires in 5 minutes. Do not share.</p></div></div></body></html>`
      const res = await sendEmail({ to: identifierNorm, subject: 'RESOURCEFLOW AI – Email Verification Code (Resent)', html: emailHtml })
      sent = res.ok
      error = res.error
    }

    return ok({
      otpExpiresAt: result.expiresAt,
      sent,
      error: sent ? undefined : (error || 'Unable to send OTP'),
      message: sent ? 'OTP resent successfully.' : 'Unable to send OTP. Please try again.',
    })
  } catch (e) {
    return handleAuthError(e)
  }
}
