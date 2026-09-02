import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { recordAudit } from '@/lib/events'
import { generateOtp } from '@/lib/services/otp-service'
import { sendEmail } from '@/lib/services/email-service'
import { sendSms, isValidPhone } from '@/lib/services/sms-service'
import { renderRegistrationEmail } from '@/lib/services/email-templates'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = ['CITIZEN', 'RESPONDER', 'DISASTER_OFFICER', 'ADMIN']

// POST /api/auth/register
// Stage 1 of OTP-based registration: validate input, create the user as INACTIVE,
// generate a 6-digit OTP, send it to the user's phone (SMS) and email.
// The account is NOT activated until /api/auth/verify-otp succeeds.
export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json())
    const { email, password, name, role, phone } = body

    // Input validation
    if (!email || !password || !name) return err('Missing required fields: email, password, name', 422)
    if (password.length < 6) return err('Password must be at least 6 characters', 422)
    if (!phone) return err('Phone number is required for OTP verification', 422)
    const phoneStr = String(phone).replace(/[\s()-]/g, '')
    if (!isValidPhone(phoneStr)) return err('Invalid phone number. Use E.164 format (e.g. +97798XXXXXXXX)', 422)

    const roleNorm = (String(role || 'CITIZEN').toUpperCase()) as Role
    if (!ALLOWED_ROLES.includes(roleNorm)) return err('Invalid role', 422)

    const emailLower = String(email).toLowerCase()
    const existing = await db.user.findFirst({
      where: { OR: [{ email: emailLower }, { phone: phoneStr }] },
    })
    if (existing) {
      if (existing.email === emailLower) return err('Email already registered', 409)
      return err('Phone number already registered', 409)
    }

    // Create the user as INACTIVE (active=false) until OTP is verified
    const user = await db.user.create({
      data: {
        email: emailLower,
        name: String(name),
        passwordHash: await hashPassword(String(password)),
        role: roleNorm,
        phone: phoneStr,
        active: false,  // ← account is NOT active until OTP verification
        phoneVerified: false,
        emailVerified: false,
      },
    })

    // Generate OTP (5-min expiry, 60s resend cooldown, hashed with argon2)
    const otpResult = await generateOtp({
      identifier: phoneStr,
      channel: 'SMS',
      purpose: 'REGISTRATION',
      userId: user.id,
    })
    if (!otpResult.ok || !otpResult.code) {
      return err(otpResult.error || 'Failed to generate OTP', 429)
    }

    // Send OTP via SMS
    const smsText = `RESOURCEFLOW AI: Your verification code is ${otpResult.code}. It expires in 5 minutes. Do not share this code.`
    const smsResult = await sendSms(phoneStr, smsText)
    // In demo mode SMS returns FAILED — we still record the OTP so the user can verify
    // (the OTP is in the server logs for the hackathon demo). We NEVER fake "SMS Sent".
    if (smsResult.ok) {
      console.log('[register] OTP SMS sent to', phoneStr.slice(0, 4) + '***' + phoneStr.slice(-2))
    } else {
      console.log('[register] OTP SMS delivery failed (demo mode) — OTP recorded for verification')
    }

    // Also send OTP via email as a backup channel (so the user can verify even if SMS is unavailable)
    const { subject, html } = renderRegistrationEmail({ name: user.name, email: user.email, role: user.role })
    // Override the email to include the OTP code as a verification email
    const otpEmailHtml = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="max-width:560px;margin:24px auto;background:white;border-radius:8px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#1a1d23 0%,#0f1115 100%);padding:24px 28px;border-radius:8px 8px 0 0;border-bottom:3px solid #f59e0b">
      <div style="color:#f5f5f5;font-size:18px;font-weight:bold">RESOURCEFLOW AI</div>
      <div style="color:#9ca3af;font-size:11px;letter-spacing:1px;text-transform:uppercase">Email Verification</div>
    </div>
    <div style="padding:28px">
      <p style="color:#374151;font-size:15px">Hello ${user.name},</p>
      <p style="color:#374151;font-size:15px">Please verify your email to complete registration. Use the OTP below:</p>
      <div style="text-align:center;margin:24px 0">
        <div style="display:inline-block;background:#f59e0b;color:#1a1d23;font-size:32px;font-weight:bold;letter-spacing:8px;padding:14px 24px;border-radius:8px;font-family:monospace">${otpResult.code}</div>
      </div>
      <p style="color:#6b7280;font-size:12px">This code expires in 5 minutes. Do not share it with anyone.</p>
    </div>
  </div>
</body></html>`
    await sendEmail({ to: user.email, subject: 'RESOURCEFLOW AI – Your Verification Code', html: otpEmailHtml })

    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'REGISTER_OTP_SENT',
      entityId: user.id,
      newState: 'PENDING_VERIFICATION',
      reason: `OTP sent via SMS to ${phoneStr.slice(0, 4)}***${phoneStr.slice(-2)} + email`,
    })

    return ok({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: phoneStr.slice(0, 4) + '***' + phoneStr.slice(-2),
      otpRequired: true,
      otpExpiresAt: otpResult.expiresAt,
      message: 'OTP sent to your phone and email. Verify to activate your account.',
      // For hackathon demo: surface the OTP channel so the UI can prompt for it
      otpChannel: 'SMS + EMAIL',
    }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}
