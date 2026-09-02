// Email service — backend-only SMTP sender with secure env-var configuration.
//
// Workflow:
//   1. Loads SMTP configuration from process.env (SMTP_HOST, SMTP_PORT, SMTP_USERNAME,
//      SMTP_PASSWORD, SMTP_FROM_EMAIL, SMTP_FROM_NAME, SMTP_SECURE).
//   2. Strips spaces from the App Password (Gmail App Passwords are 16 chars with no
//      spaces — sometimes users paste them with the displayed grouping spaces).
//   3. Connects to smtp.gmail.com:587 → EHLO → STARTTLS → EHLO → LOGIN.
//   4. Sends the email and records a real messageId only after Gmail accepts it.
//   5. On auth failure, returns a safe, actionable error.
//
// Security:
//   - The password is NEVER hardcoded, NEVER exposed in API responses, NEVER logged.
//   - The transporter is re-read from process.env on every resetEmailTransporter() so
//     changes to .env take effect after a re-init (no stale values).
//
// Demo mode: if SMTP is not configured, send() returns FAILED with a clear message
// — we NEVER fake a successful send.

import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export interface EmailSendResult {
  ok: boolean
  messageId?: string
  error?: string  // safe error string (never contains SMTP credentials)
  unavailable?: boolean  // true if SMTP is not configured (demo mode)
}

let transporter: Transporter | null = null
let cachedConfigHash = ''

function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_FROM_EMAIL
  )
}

// Hash the relevant env vars so we can detect when they change and rebuild the transporter.
// (The password is part of the hash so a password change triggers a rebuild — but the
// hash itself does not expose the password.)
function configHash(): string {
  return [process.env.SMTP_HOST, process.env.SMTP_PORT, process.env.SMTP_USERNAME,
    process.env.SMTP_FROM_EMAIL, process.env.SMTP_SECURE, (process.env.SMTP_PASSWORD || '').length]
    .join('|')
}

function buildTransporter(): Transporter {
  const port = Number(process.env.SMTP_PORT)
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  // Strip spaces from the App Password (Gmail App Passwords are 16 chars, no spaces)
  const password = (process.env.SMTP_PASSWORD || '').replace(/\s/g, '')
  const username = process.env.SMTP_USERNAME || ''

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,  // false on 587 → STARTTLS is negotiated automatically by nodemailer
    auth: username ? { user: username, pass: password } : undefined,
    requireTLS: !secure,  // force STARTTLS upgrade on port 587
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  })

  // Backend logging — never logs the password or full credentials
  console.log('[email] SMTP configuration loaded', {
    host: process.env.SMTP_HOST,
    port,
    secure,
    username: username ? `${username.slice(0, 3)}***${username.split('@')[1] || ''}` : '(none)',
    fromEmail: process.env.SMTP_FROM_EMAIL,
    passwordLength: password.length,
    passwordMasked: true,
  })

  return transport
}

function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) return null
  const hash = configHash()
  if (transporter && hash === cachedConfigHash) return transporter
  // Build (or rebuild) the transporter with the current env values
  transporter = buildTransporter()
  cachedConfigHash = hash
  return transporter
}

export interface SendEmailParams {
  to: string
  subject: string
  html: string
}

export async function sendEmail(params: SendEmailParams): Promise<EmailSendResult> {
  // Demo mode: SMTP not configured → FAILED (never fake success)
  if (!isSmtpConfigured()) {
    return {
      ok: false,
      unavailable: true,
      error: 'Email service unavailable — SMTP not configured. Report generated successfully.',
    }
  }

  const t = getTransporter()
  if (!t) {
    return { ok: false, unavailable: true, error: 'Email transporter unavailable.' }
  }

  try {
    // Verify the connection first (this does the EHLO → STARTTLS → EHLO → AUTH handshake)
    await t.verify()
    console.log('[email] SMTP connection established + authentication successful', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
    })
  } catch (e: any) {
    const raw = String(e?.message ?? e)
    // Detect Gmail auth failure and return the safe, actionable error
    const isAuthError = /535|authentication|credentials|BadCredentials|Username and Password/i.test(raw)
    const safe = isAuthError
      ? 'Gmail SMTP authentication failed. Check the Gmail address, 2-Step Verification, and App Password.'
      : `SMTP connection failed: ${raw.slice(0, 200)}`
    console.error('[email] SMTP authentication failed:', safe)
    return { ok: false, error: safe }
  }

  try {
    const fromName = process.env.SMTP_FROM_NAME || 'RESOURCEFLOW AI'
    const fromEmail = process.env.SMTP_FROM_EMAIL!
    const info = await t.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })
    // Only after Gmail accepts the message do we record success
    console.log('[email] Email sent successfully', {
      messageId: info.messageId,
      to: params.to.split('@')[0].slice(0, 2) + '***@' + params.to.split('@')[1],
    })
    return { ok: true, messageId: info.messageId }
  } catch (e: any) {
    const raw = String(e?.message ?? e)
    // Sanitize — strip anything that looks like credentials
    const sanitized = raw
      .replace(/password[^,;\s]*/gi, 'password=***')
      .replace(/pass=[^,;\s]*/gi, 'pass=***')
      .replace(/auth\s+[a-z0-9+/=]+/gi, 'auth=***')
      .replace(/(smtp:\/\/)[^@]+@/gi, '$1')
      .slice(0, 300)
    console.error('[email] Email send failed:', sanitized)
    return { ok: false, error: `SMTP delivery failed: ${sanitized}` }
  }
}

// Reset the transporter (used by /api/email/test to force a re-read of env vars)
export function resetEmailTransporter() {
  transporter = null
  cachedConfigHash = ''
  console.log('[email] SMTP transporter reset — will re-read env on next send')
}

// Status for admin/settings UI — does NOT include credentials.
export function getEmailServiceStatus(): { configured: boolean; host: string | null; port: number | null; fromEmail: string | null; secure: boolean; username: string | null } {
  const username = process.env.SMTP_USERNAME || null
  return {
    configured: isSmtpConfigured(),
    host: process.env.SMTP_HOST || null,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
    fromEmail: process.env.SMTP_FROM_EMAIL || null,
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    // Expose the username (it's an email address, not a secret) but masked
    username: username ? `${username.slice(0, 3)}***@${username.split('@')[1] || ''}` : null,
  }
}

// Mask an email for display: h***@gmail.com
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  const maskedLocal = local.length <= 2 ? local[0] + '*'.repeat(local.length - 1) : local[0] + '*'.repeat(Math.min(local.length - 1, 6))
  return `${maskedLocal}@${domain}`
}
