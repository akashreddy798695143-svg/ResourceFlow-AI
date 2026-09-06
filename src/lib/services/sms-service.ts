// src/lib/services/sms-service.ts

// ─────────────────────────────────────────────
// SMS Service
// Twilio SMS provider
// ─────────────────────────────────────────────

export interface SmsSendResult {
  ok: boolean
  messageId?: string
  error?: string
  unavailable?: boolean
}

export interface SmsProvider {
  name: string
  configured: boolean
  send(to: string, message: string): Promise<SmsSendResult>
}

// ─────────────────────────────────────────────
// Phone Masking
// ─────────────────────────────────────────────

export function maskPhone(phone: string): string {
  if (!phone) {
    return 'unknown'
  }

  const clean = phone.replace(/\D/g, '')

  if (clean.length <= 4) {
    return '****'
  }

  return `${clean.slice(0, 2)}***${clean.slice(-2)}`
}

// ─────────────────────────────────────────────
// SMS Service Status
// ─────────────────────────────────────────────

export function getSmsServiceStatus() {
  const accountSid = process.env.SMS_ACCOUNT_SID
  const apiKey = process.env.SMS_API_KEY
  const senderId = process.env.SMS_SENDER_ID

  const configured =
    !!accountSid &&
    !!apiKey &&
    !!senderId

  return {
    provider: 'twilio',
    configured,
    available: configured,
    status: configured
      ? 'configured'
      : 'not_configured',
    message: configured
      ? 'Twilio SMS service is configured'
      : 'Twilio SMS service is not configured',
  }
}

// ─────────────────────────────────────────────
// Twilio SMS Provider
// ─────────────────────────────────────────────

class TwilioSmsProvider implements SmsProvider {
  name = 'twilio'

  get configured(): boolean {
    return !!(
      process.env.SMS_ACCOUNT_SID &&
      process.env.SMS_API_KEY &&
      process.env.SMS_SENDER_ID
    )
  }

  async send(
    to: string,
    message: string
  ): Promise<SmsSendResult> {
    if (!this.configured) {
      return {
        ok: false,
        unavailable: true,
        error:
          'Twilio SMS not configured. Check SMS_ACCOUNT_SID, SMS_API_KEY and SMS_SENDER_ID.',
      }
    }

    try {
      const sid = process.env.SMS_ACCOUNT_SID!
      const token = process.env.SMS_API_KEY!
      const sender = process.env.SMS_SENDER_ID!

      // Remove WhatsApp prefix if accidentally provided
      const cleanTo = to.replace(/^whatsapp:/i, '')
      const cleanFrom = sender.replace(/^whatsapp:/i, '')

      // Twilio Messages API
      const url =
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`

      const body = new URLSearchParams({
        To: cleanTo,
        From: cleanFrom,
        Body: message,
      })

      // Twilio Basic Authentication
      const auth = Buffer
        .from(`${sid}:${token}`)
        .toString('base64')

      const response = await fetch(url, {
        method: 'POST',

        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type':
            'application/x-www-form-urlencoded',
        },

        body: body.toString(),

        signal: AbortSignal.timeout(15000),
      })

      const data: any =
        await response.json().catch(() => ({}))

      // ───────────────────────────────────────
      // Twilio Error
      // ───────────────────────────────────────

      if (!response.ok) {
        const errorMessage = String(
          data?.message ||
          data?.error_message ||
          `Twilio SMS error ${response.status}`
        ).slice(0, 300)

        return {
          ok: false,
          error:
            `Twilio SMS delivery failed: ${errorMessage}`,
        }
      }

      // ───────────────────────────────────────
      // Success
      // ───────────────────────────────────────

      return {
        ok: true,
        messageId: data?.sid,
      }

    } catch (error: any) {
      const safeError = String(
        error?.message ?? error
      )
        .replace(
          /password[=:]\S+/gi,
          'password=***'
        )
        .replace(
          /token[=:]\S+/gi,
          'token=***'
        )
        .replace(
          /secret[=:]\S+/gi,
          'secret=***'
        )
        .slice(0, 300)

      return {
        ok: false,
        error:
          `Twilio SMS delivery failed: ${safeError}`,
      }
    }
  }
}

// ─────────────────────────────────────────────
// Active SMS Provider
// ─────────────────────────────────────────────

let cachedSmsProvider: SmsProvider | null = null

let cachedProviderName = ''

function getActiveSmsProvider(): SmsProvider {
  const providerName = (
    process.env.SMS_PROVIDER || 'twilio'
  ).toLowerCase()

  // Use cached provider if provider has not changed
  if (
    cachedSmsProvider &&
    cachedProviderName === providerName
  ) {
    return cachedSmsProvider
  }

  // SMS provider is Twilio
  if (providerName === 'twilio') {
    cachedSmsProvider =
      new TwilioSmsProvider()
  } else {
    // Even if something else is configured,
    // use Twilio for this SMS-only service.
    cachedSmsProvider =
      new TwilioSmsProvider()
  }

  cachedProviderName = providerName

  return cachedSmsProvider
}

// ─────────────────────────────────────────────
// Send SMS
// ─────────────────────────────────────────────

export async function sendSms(
  to: string,
  message: string
): Promise<SmsSendResult> {

  const provider =
    getActiveSmsProvider()

  console.log(
    '[sms] provider:',
    provider.name
  )

  if (!provider.configured) {
    console.error(
      '[sms] unavailable — Twilio SMS credentials missing',
      {
        provider: provider.name,
        to: maskPhone(to),
      }
    )
  }

  const result =
    await provider.send(
      to,
      message
    )

  if (result.ok) {
    console.log(
      '[sms] sent successfully',
      {
        provider: provider.name,
        to: maskPhone(to),
        messageId: result.messageId,
      }
    )
  } else {
    console.error(
      '[sms] send failed',
      {
        provider: provider.name,
        to: maskPhone(to),
        error: result.error,
      }
    )
  }

  return result
}

// ─────────────────────────────────────────────
// SMS Alert Formatter
// ─────────────────────────────────────────────

export function formatSmsAlert(params: {
  event:
    | 'NEW_INCIDENT'
    | 'RESOURCE_ASSIGNED'
    | 'RESPONDER_UPDATE'
    | 'ESCALATION'
    | 'RESOLUTION'

  incidentCode: string
  incidentType: string
  location: string
  severity?: string
  status?: string
  resourceCode?: string
  resourceName?: string
  etaMinutes?: number
  responderStatus?: string
  escalationLevel?: number
  timestamp?: string
}): string {

  const time = params.timestamp
    ? new Date(
        params.timestamp
      ).toLocaleTimeString()
    : new Date().toLocaleTimeString()

  // ───────────────────────────────────────────
  // NEW INCIDENT
  // ───────────────────────────────────────────

  if (params.event === 'NEW_INCIDENT') {
    return [
      'RESOURCEFLOW AI ALERT',
      `Incident: ${params.incidentCode}`,
      `Type: ${params.incidentType}`,
      `Location: ${params.location}`,
      `Severity: ${params.severity || 'HIGH'}`,
      'Status: Response being coordinated',
      `Time: ${time}`,
    ].join('\n')
  }

  // ───────────────────────────────────────────
  // RESOURCE ASSIGNED
  // ───────────────────────────────────────────

  if (params.event === 'RESOURCE_ASSIGNED') {
    return [
      'RESOURCEFLOW AI ALERT',
      'RESOURCE ASSIGNED',
      `Incident: ${params.incidentCode}`,
      `Type: ${params.incidentType}`,
      `Location: ${params.location}`,
      `Resource: ${params.resourceCode || 'Response Team'}`,
      params.resourceName
        ? `Team: ${params.resourceName}`
        : '',
      params.etaMinutes != null
        ? `ETA: ${params.etaMinutes} minutes`
        : 'ETA: Updating',
      'Status: En route',
      `Time: ${time}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  // ───────────────────────────────────────────
  // RESPONDER UPDATE
  // ───────────────────────────────────────────

  if (params.event === 'RESPONDER_UPDATE') {
    return [
      'RESOURCEFLOW AI ALERT',
      'RESPONDER UPDATE',
      `Incident: ${params.incidentCode}`,
      `Type: ${params.incidentType}`,
      `Location: ${params.location}`,
      `Status: ${params.responderStatus || 'IN PROGRESS'}`,
      `Time: ${time}`,
    ].join('\n')
  }

  // ───────────────────────────────────────────
  // ESCALATION
  // ───────────────────────────────────────────

  if (params.event === 'ESCALATION') {
    return [
      'RESOURCEFLOW AI ALERT',
      `ESCALATED - LEVEL ${params.escalationLevel || 2}`,
      `Incident: ${params.incidentCode}`,
      `Type: ${params.incidentType}`,
      `Location: ${params.location}`,
      'Action: Priority emergency protocols activated',
      `Time: ${time}`,
    ].join('\n')
  }

  // ───────────────────────────────────────────
  // RESOLUTION
  // ───────────────────────────────────────────

  if (params.event === 'RESOLUTION') {
    return [
      'RESOURCEFLOW AI',
      'INCIDENT RESOLVED',
      `Incident: ${params.incidentCode}`,
      `Type: ${params.incidentType}`,
      `Location: ${params.location}`,
      'Status: Scene stabilized and incident resolved',
      `Resolved At: ${time}`,
    ].join('\n')
  }

  // ───────────────────────────────────────────
  // DEFAULT
  // ───────────────────────────────────────────

  return [
    'RESOURCEFLOW AI ALERT',
    `Incident: ${params.incidentCode}`,
    `Type: ${params.incidentType}`,
    `Location: ${params.location}`,
    `Time: ${time}`,
  ].join('\n')
}