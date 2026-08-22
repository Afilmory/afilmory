import { env } from '@afilmory/env'
import { createLogger } from '@tsuki-hono/common'
import ejs from 'ejs'
import { Resend } from 'resend'
import { injectable } from 'tsyringe'

import baseTemplate from './templates/base.ejs?raw'
import commentNotificationTemplate from './templates/comment-notification.ejs?raw'
import contentReportNotificationTemplate from './templates/content-report-notification.ejs?raw'

export const TEMPLATES = {
  commentNotification: commentNotificationTemplate,
  contentReportNotification: contentReportNotificationTemplate,
}

@injectable()
export class MailService {
  private readonly logger = createLogger('MailService')
  private resend: Resend | null = null

  constructor() {
    if (env.RESEND_API_KEY) {
      this.resend = new Resend(env.RESEND_API_KEY)
    }
    else {
      this.logger.warn('RESEND_API_KEY is not set. Mail service will be disabled.')
    }
  }

  async send(to: string, subject: string, html: string) {
    if (!this.resend) {
      this.logger.warn(`Attempted to send email to ${to} but Resend is not configured.`)
      return
    }

    try {
      const data = await this.resend.emails.send({
        from: env.RESEND_FROM,
        to,
        subject,
        html,
      })
      this.logger.info(`Email sent to ${to}, id: ${data.data?.id}`)
      this.logger.verbose(data)
      return data
    }
    catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error)
      // We don't throw here to prevent blocking the main flow, but we log it.
      // Or should we throw? For notifications, maybe better to just log.
    }
  }

  async sendTemplate(to: string, subject: string, template: string, data: Record<string, any>) {
    const content = ejs.render(template, data)
    const html = ejs.render(baseTemplate, { ...data, content, title: subject })

    return this.send(to, subject, html)
  }
}
