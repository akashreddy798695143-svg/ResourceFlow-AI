// Email service — backend-only SMTP sender with secure env-var configuration.
// Demo mode: if SMTP is not configured, send() returns a FAILED result with a
// clear "Email service unavailable" message. We NEVER fake a successful send.
//
// Environment variables (read from process.env, never hardcoded):
//   SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD,
//   SMTP_FROM_EMAIL, SMTP_FROM_NAME
//   SMTP_SECURE (optional, "true" forces TLS)
//
// All email sending happens server-side. The frontend can only request a send
// via protected API routes — it never sees SMTP credentials.

import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export interface EmailSendResult {
  ok: boolean
  messageId?: string
  error?: string  // safe error string (never contains SMTP credentials)
  unavailable?: boolean  // true if SMTP is not configured (demo mode)
}

let transporter: Transporter | null = null
let transporterConfigured = false

function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_FROM_EMAIL
  )
}

function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) return null
  if (transporter) return transporter
  const port = Number(process.env.SMTP_PORT)
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: process.env.SMTP_USERNAME
      ? { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD || '' }
      : undefined,
    // Don't fail hard in dev — surface the error
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  })
  transporterConfigured = true
  return transporter
}

export interface SendEmailParams {
  to: string
  subject: string
  html: string
}

export async function sendEmail(params: SendEmailParams): Promise<EmailSendResult> {
  // Demo mode: SMTP not configured → mark FAILED (do NOT fake success)
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
    const fromName = process.env.SMTP_FROM_NAME || 'RESOURCEFLOW AI'
    const fromEmail = process.env.SMTP_FROM_EMAIL!
    const info = await t.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })
    return { ok: true, messageId: info.messageId }
  } catch (e: any) {
    // Sanitize the error — never leak credentials. Strip anything that looks like
    // a password or auth token from the message.
    const raw = String(e?.message ?? e)
    const sanitized = raw
      .replace(/password[^,;\s]*/gi, 'password=***')
      .replace(/auth\s+[a-z0-9+/=]+/gi, 'auth=***')
      .replace(/(smtp:\/\/)[^@]+@/gi, '$1')
      .slice(0, 300)
    return { ok: false, error: `SMTP delivery failed: ${sanitized}` }
  }
}

// Reset the transporter (used by tests / config reload)
export function resetEmailTransporter() {
  transporter = null
  transporterConfigured = false
}

// Status for admin/settings UI — does NOT include credentials.
export function getEmailServiceStatus(): { configured: boolean; host: string | null; port: number | null; fromEmail: string | null; secure: boolean } {
  return {
    configured: isSmtpConfigured(),
    host: process.env.SMTP_HOST || null,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
    fromEmail: process.env.SMTP_FROM_EMAIL || null,
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
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
