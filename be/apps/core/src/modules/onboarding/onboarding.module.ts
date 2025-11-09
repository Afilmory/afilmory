import { Module } from '@afilmory/framework'

import { DatabaseModule } from '../../database/database.module'
import { AuthModule } from '../auth/auth.module'
import { SettingModule } from '../setting/setting.module'
import { SiteSettingModule } from '../site-setting/site-setting.module'
import { TenantModule } from '../tenant/tenant.module'
import { OnboardingController } from './onboarding.controller'
import { OnboardingService } from './onboarding.service'

@Module({
  imports: [DatabaseModule, AuthModule, SettingModule, SiteSettingModule, TenantModule],
  providers: [OnboardingService],
  controllers: [OnboardingController],
})
export class OnboardingModule {}
