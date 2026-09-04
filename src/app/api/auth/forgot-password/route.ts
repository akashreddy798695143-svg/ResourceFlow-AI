import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handleAuthError } from '@/lib/auth'
import { ok, parseBody } from '@/lib/api'
import { generateOtp } from '@/lib/services/otp-service'
import { sendEmail } from '@/lib/services/email-service'

const GENERIC_MESSAGE = 'If an account exists for that email, a password reset code has been sent.'

export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json())
    const email = String(body?.email || '').trim().toLowerCase()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return ok({ message: GENERIC_MESSAGE })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !user.active || !user.passwordHash) {
      return ok({ message: GENERIC_MESSAGE })
    }

    const result = await generateOtp({
      identifier: email,
      channel: 'EMAIL',
      purpose: 'PASSWORD_RESET',
      userId: user.id,
    })

    if (!result.ok || !result.code) {
      return ok({ message: GENERIC_MESSAGE, retryAfter: result.resendCooldownUntil })
    }

    const emailHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif"><div style="max-width:560px;margin:24px auto;background:white;border-radius:8px;overflow:hidden"><div style="background:#111827;padding:24px 28px;border-bottom:3px solid #f59e0b"><div style="color:#f9fafb;font-size:18px;font-weight:bold">RESOURCEFLOW AI</div><div style="color:#9ca3af;font-size:11px;letter-spacing:1px;text-transform:uppercase">Password Reset</div></div><div style="padding:28px"><p style="color:#374151;font-size:15px">Hello ${user.name},</p><p style="color:#374151;font-size:15px">Use this one-time code to reset your password:</p><div style="text-align:center;margin:24px 0"><div style="display:inline-block;background:#f59e0b;color:#111827;font-size:32px;font-weight:bold;letter-spacing:8px;padding:14px 24px;border-radius:8px;font-family:monospace">${result.code}</div></div><p style="color:#6b7280;font-size:12px">This code expires in 5 minutes. If you did not request this, you can ignore this email.</p></div></div></body></html>`
    await sendEmail({ to: email, subject: 'RESOURCEFLOW AI – Password Reset Code', html: emailHtml })

    return ok({ message: GENERIC_MESSAGE, otpExpiresAt: result.expiresAt })
  } catch (e) {
    return handleAuthError(e)
  }
}
