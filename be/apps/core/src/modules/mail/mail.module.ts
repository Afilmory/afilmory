import { SystemSettingModule } from '@core/modules/configuration/system-setting/system-setting.module'
import { Module } from '@tsuki-hono/common'

import { CommentNotificationListener } from './listeners/comment-notification.listener'
import { ContentReportNotificationListener } from './listeners/content-report-notification.listener'
import { MailService } from './mail.service'

@Module({
  imports: [SystemSettingModule],
  providers: [MailService, CommentNotificationListener, ContentReportNotificationListener],
  exports: [MailService],
})
export class MailModule {}
