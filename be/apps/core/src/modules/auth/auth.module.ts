import { Module } from '@afilmory/framework'
import { DatabaseModule } from 'core/database/database.module'

import { SettingModule } from '../setting/setting.module'
import { SystemSettingModule } from '../system-setting/system-setting.module'
import { TenantModule } from '../tenant/tenant.module'
import { AuthConfig } from './auth.config'
import { AuthController } from './auth.controller'
import { AuthProvider } from './auth.provider'
import { AuthRegistrationService } from './auth-registration.service'

@Module({
  imports: [DatabaseModule, SystemSettingModule, SettingModule, TenantModule],
  controllers: [AuthController],
  providers: [AuthProvider, AuthConfig, AuthRegistrationService],
})
export class AuthModule {}
