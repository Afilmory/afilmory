import { Module } from '@tsuki/framework'
import { SystemSettingModule } from 'core/modules/configuration/system-setting/system-setting.module'

import { CommentNotificationListener } from './listeners/comment-notification.listener'
import { MailService } from './mail.service'

@Module({
  imports: [SystemSettingModule],
  providers: [MailService, CommentNotificationListener],
  exports: [MailService],
})
export class MailModule {}
