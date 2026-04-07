import { Module } from '@tsuki/framework'
import { DatabaseModule } from 'core/database/database.module'
import { AppStateModule } from 'core/modules/app/app-state/app-state.module'
import { SettingModule } from 'core/modules/configuration/setting/setting.module'
import { SystemSettingModule } from 'core/modules/configuration/system-setting/system-setting.module'

import { TenantModule } from '../tenant/tenant.module'
import { AuthConfig } from './auth.config'
import { AuthController } from './auth.controller'
import { AuthProvider } from './auth.provider'
import { AuthRegistrationService } from './auth-registration.service'

@Module({
  imports: [DatabaseModule, SystemSettingModule, SettingModule, TenantModule, AppStateModule],
  controllers: [AuthController],
  providers: [AuthProvider, AuthConfig, AuthRegistrationService],
})
export class AuthModule {}
