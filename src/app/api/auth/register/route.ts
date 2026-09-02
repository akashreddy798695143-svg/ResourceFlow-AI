import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { recordAudit } from '@/lib/events'
import { generateOtp } from '@/lib/services/otp-service'
import { sendEmail } from '@/lib/services/email-service'
import { sendSms, isValidPhone } from '@/lib/services/sms-service'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = ['CITIZEN', 'RESPONDER', 'DISASTER_OFFICER', 'ADMIN']

// POST /api/auth/register
// Stage 1 of dual-OTP registration: validate input, create user as INACTIVE,
// generate TWO separate 6-digit OTPs (one for phone via SMS, one for email),
// send them through their respective channels. The account is NOT activated
// until /api/auth/verify-otp verifies BOTH.
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
    const emailLower = String(email).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) return err('Invalid email address', 422)

    const roleNorm = (String(role || 'CITIZEN').toUpperCase()) as Role
    if (!ALLOWED_ROLES.includes(roleNorm)) return err('Invalid role', 422)

    const existing = await db.user.findFirst({
      where: { OR: [{ email: emailLower }, { phone: phoneStr }] },
    })
    if (existing) {
      if (existing.email === emailLower) return err('Email already registered', 409)
      return err('Phone number already registered', 409)
    }

    // Create the user as INACTIVE (active=false) until BOTH OTPs are verified
    const user = await db.user.create({
      data: {
        email: emailLower,
        name: String(name),
        passwordHash: await hashPassword(String(password)),
        role: roleNorm,
        phone: phoneStr,
        active: false,
        phoneVerified: false,
        emailVerified: false,
      },
    })

    // ─── Generate + send PHONE OTP (SMS) ─────────────────────────────────
    const phoneOtpResult = await generateOtp({
      identifier: phoneStr,
      channel: 'SMS',
      purpose: 'REGISTRATION',
      userId: user.id,
    })
    let phoneOtpSent = false
    let phoneOtpError: string | undefined
    if (phoneOtpResult.ok && phoneOtpResult.code) {
      const smsText = `RESOURCEFLOW AI: Your phone verification code is ${phoneOtpResult.code}. It expires in 5 minutes. Do not share this code.`
      const smsRes = await sendSms(phoneStr, smsText)
      phoneOtpSent = smsRes.ok
      phoneOtpError = smsRes.error
      // If SMS fails, we DO NOT fake success. The user can retry via /resend-otp.
      // The OTP record exists in the DB so the user can still verify it (the SMS
      // may arrive late, or the user can request a resend).
    } else {
      phoneOtpError = phoneOtpResult.error
    }

    // ─── Generate + send EMAIL OTP (email) ──────────────────────────────
    const emailOtpResult = await generateOtp({
      identifier: emailLower,
      channel: 'EMAIL',
      purpose: 'REGISTRATION',
      userId: user.id,
    })
    let emailOtpSent = false
    let emailOtpError: string | undefined
    if (emailOtpResult.ok && emailOtpResult.code) {
      const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif"><div style="max-width:560px;margin:24px auto;background:white;border-radius:8px;overflow:hidden"><div style="background:linear-gradient(135deg,#1a1d23 0%,#0f1115 100%);padding:24px 28px;border-radius:8px 8px 0 0;border-bottom:3px solid #f59e0b"><div style="color:#f5f5f5;font-size:18px;font-weight:bold">RESOURCEFLOW AI</div><div style="color:#9ca3af;font-size:11px;letter-spacing:1px;text-transform:uppercase">Email Verification</div></div><div style="padding:28px"><p style="color:#374151;font-size:15px">Hello ${user.name},</p><p style="color:#374151;font-size:15px">Please verify your email to complete registration. Use the OTP below:</p><div style="text-align:center;margin:24px 0"><div style="display:inline-block;background:#f59e0b;color:#1a1d23;font-size:32px;font-weight:bold;letter-spacing:8px;padding:14px 24px;border-radius:8px;font-family:monospace">${emailOtpResult.code}</div></div><p style="color:#6b7280;font-size:12px">This code expires in 5 minutes. Do not share it with anyone.</p></div></div></body></html>`
      const emailRes = await sendEmail({ to: emailLower, subject: 'RESOURCEFLOW AI – Email Verification Code', html: emailHtml })
      emailOtpSent = emailRes.ok
      emailOtpError = emailRes.error
    } else {
      emailOtpError = emailOtpResult.error
    }

    await recordAudit({
      userId: user.id,
      role: user.role,
      action: 'REGISTER_OTP_SENT',
      entityId: user.id,
      newState: 'PENDING_DUAL_VERIFICATION',
      reason: `Phone OTP ${phoneOtpSent ? 'sent' : 'FAILED'}, Email OTP ${emailOtpSent ? 'sent' : 'FAILED'}`,
    })

    return ok({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: phoneStr.slice(0, 4) + '***' + phoneStr.slice(-2),
      otpRequired: true,
      dualOtp: true,  // both phone + email must be verified
      phoneOtpSent,
      emailOtpSent,
      phoneOtpError: phoneOtpSent ? undefined : (phoneOtpError || 'Unable to send OTP via SMS'),
      emailOtpError: emailOtpSent ? undefined : (emailOtpError || 'Unable to send OTP via email'),
      otpExpiresAt: phoneOtpResult.expiresAt,
      message: 'Verification codes sent to your phone (SMS) and email. Verify both to activate your account.',
    }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}
