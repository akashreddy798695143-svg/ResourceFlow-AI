// ResourceFlow AI — WhatsApp notification service
//
// Twilio Trial-compatible implementation.
// Trial WhatsApp messages must use a pre-approved ContentSid template.
//
// Required .env.local:
// WHATSAPP_PROVIDER=twilio
// WHATSAPP_ACCOUNT_SID=YOUR_ACCOUNT_SID
// WHATSAPP_API_KEY=YOUR_AUTH_TOKEN
// WHATSAPP_SENDER_ID=whatsapp:+YOUR_TWILIO_WHATSAPP_NUMBER
// WHATSAPP_CONTENT_SID=YOUR_TWILIO_APPROVED_CONTENT_SID

import { maskPhone } from '@/lib/services/sms-service'

export interface WhatsAppSendResult {
  ok: boolean
  messageId?: string
  error?: string
  unavailable?: boolean
}

export interface WhatsAppProvider {
  name: string
  configured: boolean
  send(to: string, message: string): Promise<WhatsAppSendResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// Twilio WhatsApp Provider
// ─────────────────────────────────────────────────────────────────────────────

class TwilioWhatsAppProvider implements WhatsAppProvider {
  name = 'twilio'

  get configured(): boolean {
    return Boolean(
      process.env.WHATSAPP_ACCOUNT_SID &&
      process.env.WHATSAPP_API_KEY &&
      process.env.WHATSAPP_SENDER_ID &&
      process.env.WHATSAPP_CONTENT_SID
    )
  }

  async send(
    to: string,
    message: string
  ): Promise<WhatsAppSendResult> {
    try {
      const accountSid = process.env.WHATSAPP_ACCOUNT_SID
      const authToken = process.env.WHATSAPP_API_KEY
      const senderId = process.env.WHATSAPP_SENDER_ID
      const contentSid = process.env.WHATSAPP_CONTENT_SID

      if (!accountSid) {
        return {
          ok: false,
          unavailable: true,
          error: 'WHATSAPP_ACCOUNT_SID is missing.',
        }
      }

      if (!authToken) {
        return {
          ok: false,
          unavailable: true,
          error: 'WHATSAPP_API_KEY is missing.',
        }
      }

      if (!senderId) {
        return {
          ok: false,
          unavailable: true,
          error: 'WHATSAPP_SENDER_ID is missing.',
        }
      }

      if (!contentSid) {
        return {
          ok: false,
          unavailable: true,
          error: 'WHATSAPP_CONTENT_SID is missing.',
        }
      }

      // Validate ContentSid format (should start with HX followed by 32 hex chars)
      const contentSidRegex = /^HX[A-Fa-f0-9]{32}$/
      if (!contentSidRegex.test(contentSid)) {
        return {
          ok: false,
          error: `Invalid WHATSAPP_CONTENT_SID format: "${contentSid}". Must be a valid Twilio ContentSid (e.g., HX1234567890abcdef1234567890abcdef). Get this from Twilio Console > Content Editor.`,
        }
      }

      // Validate phone numbers are in E.164 format (e.g., +1234567890)
      const phoneRegex = /^\+?[1-9]\d{1,14}$/
      
      // Clean the sender number (remove whatsapp: prefix for validation)
      const cleanSender = senderId.replace(/^whatsapp:/i, '')
      if (!phoneRegex.test(cleanSender)) {
        return {
          ok: false,
          error: `Invalid WHATSAPP_SENDER_ID format: "${senderId}". Must be E.164 format (e.g., whatsapp:+1234567890).`,
        }
      }

      // Clean the recipient number (remove whatsapp: prefix for validation)
      const cleanTo = to.replace(/^whatsapp:/i, '')
      if (!phoneRegex.test(cleanTo)) {
        return {
          ok: false,
          error: `Invalid recipient phone format: "${to}". Must be E.164 format (e.g., whatsapp:+1234567890). Trial accounts can only send to verified numbers.`,
        }
      }

      // Sender - ensure E.164 format with whatsapp: prefix
      const from = `whatsapp:${cleanSender.startsWith('+') ? cleanSender : '+' + cleanSender}`

      // Recipient - ensure E.164 format with whatsapp: prefix
      const formattedTo = `whatsapp:${cleanTo.startsWith('+') ? cleanTo : '+' + cleanTo}`

      // Twilio Messages API
      const url =
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

      /*
       * IMPORTANT:
       *
       * Trial WhatsApp does NOT allow arbitrary Body messages.
       *
       * Therefore we use:
       *
       * ContentSid
       * ContentVariables
       *
       * instead of Body.
       */

      const variables = createTemplateVariables(message)

      // Trial accounts: only send required parameters
      // Do NOT include optional parameters like StatusCallback, MessagingServiceSid, etc.
      const body = new URLSearchParams()
      body.append('To', formattedTo)
      body.append('From', from)
      body.append('ContentSid', contentSid)
      body.append('ContentVariables', JSON.stringify(variables))

      // Account SID + Auth Token
      const basicAuth = Buffer
        .from(`${accountSid}:${authToken}`)
        .toString('base64')

      console.log(
        '[whatsapp:twilio] sending template message',
        {
          to: maskPhone(to),
          from,
          contentSid,
          variables,
        }
      )

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15000),
      })

      const data: any = await response
        .json()
        .catch(() => ({}))

      if (!response.ok) {
        const errorMessage =
          data?.message ||
          data?.error_message ||
          `Twilio API error ${response.status}`

        console.error(
          '[whatsapp:twilio] Twilio API error:',
          {
            status: response.status,
            message: errorMessage,
            code: data?.code,
            moreInfo: data?.more_info,
          }
        )

        // Provide specific guidance for trial account limitations
        let userMessage = `Twilio WhatsApp error: ${errorMessage}`
        
        if (errorMessage.includes('trial') || errorMessage.includes('upgrade')) {
          userMessage = 
            `Twilio trial account restriction: ${errorMessage}. ` +
            `FIX: 1) Verify recipient number in Twilio Console > Phone Numbers > Verified Caller IDs. ` +
            `2) Ensure WHATSAPP_SENDER_ID is your Twilio WhatsApp number (format: whatsapp:+1234567890). ` +
            `3) Ensure WHATSAPP_CONTENT_SID is an approved WhatsApp template. ` +
            `4) Trial accounts can only send to verified numbers. Upgrade account to send to any number.`
        } else if (errorMessage.includes('Invalid or disallowed parameters')) {
          userMessage = 
            `Twilio WhatsApp parameter error: ${errorMessage}. ` +
            `FIX: 1) Check that ContentSid matches an approved template. ` +
            `2) Ensure ContentVariables match template variables ({{1}}, {{2}}, etc). ` +
            `3) Trial accounts cannot use advanced parameters like StatusCallback.`
        }

        return {
          ok: false,
          error: userMessage.slice(0, 500),
        }
      }

      console.log(
        '[whatsapp:twilio] WhatsApp sent successfully',
        {
          messageId: data?.sid,
          status: data?.status,
          to: maskPhone(to),
        }
      )

      return {
        ok: true,
        messageId: data?.sid,
      }
    } catch (error: any) {
      const errorMessage =
        error?.message || String(error)

      console.error(
        '[whatsapp:twilio] Request failed:',
        errorMessage
      )

      return {
        ok: false,
        error:
          `WhatsApp delivery failed: ${errorMessage}`.slice(
            0,
            300
          ),
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Console Provider
// ─────────────────────────────────────────────────────────────────────────────

class ConsoleWhatsAppProvider
  implements WhatsAppProvider
{
  name = 'console'
  configured = false

  async send(
    to: string,
    message: string
  ): Promise<WhatsAppSendResult> {
    console.log(
      '[whatsapp:console] would send to',
      maskPhone(to),
      '::',
      message.slice(0, 160)
    )

    return {
      ok: false,
      unavailable: true,
      error:
        'WhatsApp provider is not configured.',
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Variables
// ─────────────────────────────────────────────────────────────────────────────

function createTemplateVariables(
  message: string
): Record<string, string> {
  /*
   * Your Twilio trial template determines what
   * {{1}}, {{2}}, {{3}}, etc. mean.
   *
   * We extract useful information from the ResourceFlow
   * message and provide it as template variables.
   */

  const incidentMatch =
    message.match(/RF-\d{4}-\d+/)

  const locationMatch =
    message.match(
      /(?:at|Location:)\s*(.+?)(?:\n|$)/i
    )

  const incidentCode =
    incidentMatch?.[0] || 'ResourceFlow Incident'

  const location =
    locationMatch?.[1]?.trim() ||
    'Emergency location'

  return {
    '1': incidentCode,
    '2': location,
    '3': 'ResourceFlow AI Emergency',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Selection
// ─────────────────────────────────────────────────────────────────────────────

let cachedWhatsAppProvider:
  | WhatsAppProvider
  | null = null

let cachedWhatsAppProviderName = ''

function getActiveWhatsAppProvider(): WhatsAppProvider {
  const providerName = (
    process.env.WHATSAPP_PROVIDER ||
    'console'
  ).toLowerCase()

  if (
    cachedWhatsAppProvider &&
    cachedWhatsAppProviderName === providerName
  ) {
    return cachedWhatsAppProvider
  }

  if (providerName === 'twilio') {
    cachedWhatsAppProvider =
      new TwilioWhatsAppProvider()
  } else {
    cachedWhatsAppProvider =
      new ConsoleWhatsAppProvider()
  }

  cachedWhatsAppProviderName = providerName

  return cachedWhatsAppProvider
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Service Status
// ─────────────────────────────────────────────────────────────────────────────

export function getWhatsAppServiceStatus() {
  const configured = Boolean(
    process.env.WHATSAPP_ACCOUNT_SID &&
    process.env.WHATSAPP_API_KEY &&
    process.env.WHATSAPP_SENDER_ID &&
    process.env.WHATSAPP_CONTENT_SID
  )

  return {
    provider: process.env.WHATSAPP_PROVIDER || 'console',
    configured,
    available: configured,
    status: configured ? 'configured' : 'not_configured',
    message: configured
      ? 'WhatsApp service is configured'
      : 'WhatsApp service is not configured',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Send Function
// ─────────────────────────────────────────────────────────────────────────────

export async function sendWhatsApp(
  to: string,
  message: string
): Promise<WhatsAppSendResult> {
  const provider =
    getActiveWhatsAppProvider()

  console.log(
    '[whatsapp] provider:',
    provider.name
  )

  if (!provider.configured) {
    console.log(
      '[whatsapp] unavailable — provider not configured',
      {
        provider: provider.name,
        to: maskPhone(to),
      }
    )
  }

  const result = await provider.send(
    to,
    message
  )

  if (result.ok) {
    console.log(
      '[whatsapp] sent successfully',
      {
        provider: provider.name,
        to: maskPhone(to),
        messageId: result.messageId,
      }
    )
  } else if (!result.unavailable) {
    console.error(
      '[whatsapp] send failed',
      {
        provider: provider.name,
        to: maskPhone(to),
        error: result.error,
      }
    )
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// ResourceFlow AI WhatsApp Alert Formatter
// ─────────────────────────────────────────────────────────────────────────────

export function formatWhatsAppAlert(params: {
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
  const timestamp = params.timestamp
    ? new Date(
        params.timestamp
      ).toLocaleTimeString()
    : new Date().toLocaleTimeString()

  const header =
    'RESOURCEFLOW AI EMERGENCY ALERT'

  const code =
    `Incident: ${params.incidentCode} (${params.incidentType})`

  const location =
    `Location: ${params.location}`

  switch (params.event) {
    case 'NEW_INCIDENT':
      return [
        header,
        code,
        location,
        `Severity: ${
          params.severity || 'HIGH'
        }`,
        'Status: Prioritized',
        `Time: ${timestamp}`,
      ].join('\n')

    case 'RESOURCE_ASSIGNED':
      return [
        header,
        'Update: Resource Deployed',
        code,
        location,
        `Assigned Resource: ${
          params.resourceCode ||
          'Response Team'
        } ${
          params.resourceName
            ? `(${params.resourceName})`
            : ''
        }`,
        params.etaMinutes != null
          ? `ETA: ~${params.etaMinutes} minutes`
          : 'ETA: Coordinating',
        'Status: En route',
        `Time: ${timestamp}`,
      ].join('\n')

    case 'RESPONDER_UPDATE':
      return [
        header,
        'Responder Live Status Update',
        code,
        location,
        `Live Status: ${
          params.responderStatus ||
          'IN PROGRESS'
        }`,
        `Time: ${timestamp}`,
      ].join('\n')

    case 'ESCALATION':
      return [
        header,
        `INCIDENT ESCALATED — LEVEL ${
          params.escalationLevel || 2
        }`,
        code,
        location,
        'Priority emergency protocols activated',
        `Time: ${timestamp}`,
      ].join('\n')

    case 'RESOLUTION':
      return [
        'RESOURCEFLOW AI INCIDENT RESOLVED',
        code,
        location,
        'Final Outcome: Scene stabilized and incident resolved.',
        `Resolved At: ${timestamp}`,
      ].join('\n')

    default:
      return [
        header,
        code,
        location,
        `Time: ${timestamp}`,
      ].join('\n')
  }
}