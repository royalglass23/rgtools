import nodemailer from 'nodemailer'
import { buildServiceM8InboxEmail, type ServiceM8LeadSyncRecord } from './payload'

export type ServiceM8SyncResult = {
  reference: string
  noteSignature: string
}

export type ServiceM8Client = {
  sendLeadToInbox: (
    record: ServiceM8LeadSyncRecord,
    options?: { createNote?: boolean },
  ) => Promise<ServiceM8SyncResult>
}

type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
  from: string
  inboxRecipients: string[]
}

export function createServiceM8ClientFromEnv(): ServiceM8Client {
  return createServiceM8InboxClient(loadSmtpConfigFromEnv())
}

export function createServiceM8InboxClient(config: SmtpConfig): ServiceM8Client {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user || config.pass ? {
      user: config.user,
      pass: config.pass,
    } : undefined,
    disableFileAccess: true,
    disableUrlAccess: true,
  })

  return {
    async sendLeadToInbox(record, options = {}) {
      const payload = buildServiceM8InboxEmail(record, config.inboxRecipients)

      if (options.createNote === false) {
        return {
          reference: `inbox:${record.leadId}:unchanged`,
          noteSignature: payload.noteSignature,
        }
      }

      const info = await transporter.sendMail({
        from: config.from,
        to: payload.to,
        subject: payload.subject,
        text: payload.body,
      })

      return {
        reference: String(info.messageId || `inbox:${record.leadId}`),
        noteSignature: payload.noteSignature,
      }
    },
  }
}

function loadSmtpConfigFromEnv(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim()
  const port = Number(process.env.SMTP_PORT ?? '587')
  const from = process.env.SMTP_FROM?.trim()
  const inboxRecipients = parseRecipients(process.env.SERVICEM8_INBOX_EMAIL)

  if (!host) throw new Error('SMTP_HOST is not configured')
  if (!Number.isInteger(port) || port <= 0) throw new Error('SMTP_PORT is invalid')
  if (!from) throw new Error('SMTP_FROM is not configured')
  if (inboxRecipients.length === 0) throw new Error('SERVICEM8_INBOX_EMAIL is not configured')

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    user: process.env.SMTP_USER?.trim() || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from,
    inboxRecipients,
  }
}

function parseRecipients(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((recipient) => recipient.trim())
    .filter(Boolean)
}
