// OTP service — generates, hashes, verifies, and rate-limits 6-digit OTPs.
// OTPs are never stored in plaintext — only the argon2 hash is persisted.
// OTPs expire after 5 minutes, allow max 5 verification attempts, and enforce
// a 60-second resend cooldown to prevent abuse.
//
// Security:
//   - 6-digit code generated with crypto.randomInt (cryptographically secure)
//   - Stored as argon2id hash (never plaintext)
//   - 5-minute TTL
//   - Max 5 verification attempts per OTP (then must request a new one)
//   - 60-second resend cooldown per (identifier, purpose)
//   - Consumed on success (single-use)
//   - Rate-limited per identifier

import argon2 from 'argon2'
import { randomInt } from 'crypto'
import { db } from '@/lib/db'

const OTP_TTL_MS = 5 * 60 * 1000      // 5 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000  // 60 seconds
const OTP_MAX_ATTEMPTS = 5
const OTP_DIGITS = 6

export interface OtpGenerationResult {
  ok: boolean
  code?: string  // the plaintext code — returned ONLY to the caller that will dispatch it
  expiresAt: Date
  resendCooldownUntil?: Date
  error?: string
}

export interface OtpVerificationResult {
  ok: boolean
  userId?: string
  error?: string
  remainingAttempts?: number
}

// Generate a 6-digit OTP and persist a hash. Returns the plaintext code ONCE
// (the caller is responsible for sending it via SMS/email and never logging it).
export async function generateOtp(params: {
  identifier: string  // phone (E.164) or email
  channel: 'SMS' | 'EMAIL'
  purpose: 'REGISTRATION' | 'PASSWORD_RESET' | 'PHONE_VERIFY'
  userId?: string
}): Promise<OtpGenerationResult> {
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)

  // Resend cooldown: check if there's a non-consumed, non-expired OTP for this
  // (identifier, purpose) created within the last 60s. If so, refuse.
  const recent = await db.otpVerification.findFirst({
    where: {
      identifier: params.identifier,
      purpose: params.purpose,
      consumed: false,
      createdAt: { gte: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (recent) {
    const cooldownUntil = new Date(recent.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS)
    return {
      ok: false,
      expiresAt,
      resendCooldownUntil: cooldownUntil,
      error: `OTP resend cooldown active. Try again after ${cooldownUntil.toLocaleTimeString()}.`,
    }
  }

  // Invalidate (consume) any previous unconsumed OTPs for this identifier+purpose
  await db.otpVerification.updateMany({
    where: { identifier: params.identifier, purpose: params.purpose, consumed: false },
    data: { consumed: true, consumedAt: new Date() },
  })

  // Generate a 6-digit code with crypto-secure RNG
  const code = String(cryptoRandomInt(0, 1_000_000)).padStart(OTP_DIGITS, '0')
  const codeHash = await argon2.hash(code, { type: argon2.argon2id })

  await db.otpVerification.create({
    data: {
      identifier: params.identifier,
      channel: params.channel,
      purpose: params.purpose,
      codeHash,
      expiresAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
      userId: params.userId,
    },
  })

  // OTP generated — never log the code itself
  console.log('[otp] generated', { identifier: maskIdentifier(params.identifier), purpose: params.purpose, channel: params.channel })

  return { ok: true, code, expiresAt }
}

// Verify a submitted OTP against the stored hash. Returns ok=true only when:
//   - there's a matching unconsumed OTP for (identifier, purpose)
//   - it hasn't expired
//   - the code hash matches
//   - attempts haven't exceeded maxAttempts
// On success, the OTP is marked consumed (single-use). On failure, attempts++.
export async function verifyOtp(params: {
  identifier: string
  purpose: 'REGISTRATION' | 'PASSWORD_RESET' | 'PHONE_VERIFY'
  code: string
}): Promise<OtpVerificationResult> {
  const record = await db.otpVerification.findFirst({
    where: { identifier: params.identifier, purpose: params.purpose, consumed: false },
    orderBy: { createdAt: 'desc' },
  })
  if (!record) {
    return { ok: false, error: 'No active OTP found. Please request a new one.' }
  }
  if (record.expiresAt < new Date()) {
    await db.otpVerification.update({ where: { id: record.id }, data: { consumed: true, consumedAt: new Date() } })
    return { ok: false, error: 'OTP has expired. Please request a new one.' }
  }
  if (record.attempts >= record.maxAttempts) {
    await db.otpVerification.update({ where: { id: record.id }, data: { consumed: true, consumedAt: new Date() } })
    return { ok: false, error: 'Maximum verification attempts reached. Please request a new OTP.' }
  }

  // Increment attempts BEFORE verifying (prevents timing-based brute force)
  await db.otpVerification.update({
    where: { id: record.id },
    data: { attempts: { increment: 1 } },
  })

  const valid = await argon2.verify(record.codeHash, params.code)
  if (!valid) {
    const remaining = record.maxAttempts - (record.attempts + 1)
    return {
      ok: false,
      error: 'Invalid OTP code.',
      remainingAttempts: Math.max(0, remaining),
    }
  }

  // Success — consume the OTP (single-use)
  await db.otpVerification.update({
    where: { id: record.id },
    data: { consumed: true, consumedAt: new Date() },
  })

  console.log('[otp] verified', { identifier: maskIdentifier(params.identifier), purpose: params.purpose })

  return { ok: true, userId: record.userId ?? undefined }
}

// Mask an identifier (phone or email) for safe logging
function maskIdentifier(id: string): string {
  if (id.includes('@')) {
    const [local, domain] = id.split('@')
    return `${local.slice(0, 2)}***@${domain}`
  }
  // phone — keep country code + last 2 digits
  if (id.startsWith('+')) {
    return `${id.slice(0, 3)}***${id.slice(-2)}`
  }
  return `${id.slice(0, 2)}***${id.slice(-2)}`
}

// Crypto-secure random integer in [min, max)
function cryptoRandomInt(min: number, max: number): number {
  return randomInt(min, max)
}

export { OTP_TTL_MS, OTP_RESEND_COOLDOWN_MS, OTP_MAX_ATTEMPTS }
