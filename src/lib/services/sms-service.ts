// SMS service — provider abstraction with demo-mode fallback.
//
// Architecture:
//   SmsProvider interface (sendSms) → ConsoleSmsProvider (demo) | TwilioSmsProvider (real)
//   The active provider is selected from SMS_PROVIDER env var. If SMS is not
//   configured, the service returns FAILED (never fakes "SMS Sent").
//
// Environment variables:
//   SMS_PROVIDER=console | twilio    (default: console = demo mode)
//   SMS_API_KEY=<provider api key>
//   SMS_SENDER_ID=<sender id / from number>
//   SMS_ACCOUNT_SID=<twilio account sid>  (twilio only)
//
// Security:
//   - Credentials read from env only — never hardcoded
//   - Never exposed in API responses
//   - Never logged (recipients are masked in logs)

export interface SmsSendResult {
  ok: boolean
  messageId?: string
  error?: string  // safe error string (never contains SMS credentials)
  unavailable?: boolean  // true if SMS is not configured (demo mode)
}

export interface SmsProvider {
  name: string
  configured: boolean
  send(to: string, message: string): Promise<SmsSendResult>
}

// ─── Console (demo) provider ───────────────────────────────────────────────
// Always returns FAILED — never fakes success. Logs the would-be message so
// the dev can see the content during testing.
class ConsoleSmsProvider implements SmsProvider {
  name = 'console'
  configured = false
  async send(to: string, message: string): Promise<SmsSendResult> {
    // In demo mode we log the message (recipient masked) so developers can
    // see what WOULD be sent — but we return FAILED because no real delivery happened.
    console.log('[sms:console] would send to', maskPhone(to), '::', message.slice(0, 120))
    return {
      ok: false,
      unavailable: true,
      error: 'SMS service unavailable — SMS_PROVIDER not configured. Notification recorded.',
    }
  }
}

// ─── Twilio provider (real) ────────────────────────────────────────────────
// Uses Twilio's REST API via fetch (no SDK dependency). Active when
// SMS_PROVIDER=twilio + SMS_ACCOUNT_SID + SMS_API_KEY are set.
class TwilioSmsProvider implements SmsProvider {
  name = 'twilio'
  configured = !!(process.env.SMS_ACCOUNT_SID && process.env.SMS_API_KEY && process.env.SMS_SENDER_ID)

  async send(to: string, message: string): Promise<SmsSendResult> {
    if (!this.configured) {
      return { ok: false, unavailable: true, error: 'Twilio SMS not fully configured.' }
    }
    try {
      const sid = process.env.SMS_ACCOUNT_SID!
      const token = process.env.SMS_API_KEY!
      const from = process.env.SMS_SENDER_ID!
      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
      const body = new URLSearchParams({ To: to, From: from, Body: message })
      const auth = Buffer.from(`${sid}:${token}`).toString('base64')
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15000),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        const safe = String(data?.message || `Twilio error ${res.status}`).slice(0, 200)
        return { ok: false, error: `SMS delivery failed: ${safe}` }
      }
      return { ok: true, messageId: data.sid }
    } catch (e: any) {
      const safe = String(e?.message ?? e).replace(/[^,\s]*password[^,\s]*/gi, '***').slice(0, 200)
      return { ok: false, error: `SMS delivery failed: ${safe}` }
    }
  }
}

// ─── Active provider selection ─────────────────────────────────────────────
let cachedProvider: SmsProvider | null = null
let cachedProviderName = ''

function getActiveProvider(): SmsProvider {
  const name = (process.env.SMS_PROVIDER || 'console').toLowerCase()
  if (cachedProvider && cachedProviderName === name) return cachedProvider
  if (name === 'twilio') cachedProvider = new TwilioSmsProvider()
  else cachedProvider = new ConsoleSmsProvider()
  cachedProviderName = name
  console.log('[sms] provider selected', { provider: cachedProvider.name, configured: cachedProvider.configured })
  return cachedProvider
}

export async function sendSms(to: string, message: string): Promise<SmsSendResult> {
  const provider = getActiveProvider()
  if (!provider.configured) {
    // Demo mode — still log so devs can see content, but never fake success
    console.log('[sms] unavailable — provider not configured', { provider: provider.name, to: maskPhone(to) })
  }
  const result = await provider.send(to, message)
  if (result.ok) {
    console.log('[sms] sent successfully', { provider: provider.name, to: maskPhone(to), messageId: result.messageId })
  } else if (!result.unavailable) {
    console.error('[sms] send failed', { provider: provider.name, to: maskPhone(to), error: result.error })
  }
  return result
}

export function resetSmsProvider() {
  cachedProvider = null
  cachedProviderName = ''
}

export function getSmsServiceStatus(): { provider: string; configured: boolean; senderId: string | null } {
  const name = (process.env.SMS_PROVIDER || 'console').toLowerCase()
  const provider = name === 'twilio' ? new TwilioSmsProvider() : new ConsoleSmsProvider()
  return {
    provider: name,
    configured: provider.configured,
    senderId: process.env.SMS_SENDER_ID || null,
  }
}

// Mask a phone number for safe logging/display: +977***45
export function maskPhone(phone: string): string {
  if (!phone) return phone
  if (phone.startsWith('+')) {
    return `${phone.slice(0, 4)}***${phone.slice(-2)}`
  }
  return `${phone.slice(0, 2)}***${phone.slice(-2)}`
}

// Validate an E.164-style phone number (+ followed by 8-15 digits)
export function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{7,14}$/.test(phone.replace(/[\s()-]/g, ''))
}
