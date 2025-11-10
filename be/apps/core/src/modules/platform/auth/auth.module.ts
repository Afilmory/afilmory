import { Module } from '@afilmory/framework'
import { DatabaseModule } from 'core/database/database.module'
import { SettingModule } from 'core/modules/configuration/setting/setting.module'
import { SystemSettingModule } from 'core/modules/configuration/system-setting/system-setting.module'
import { AppStateModule } from 'core/modules/infrastructure/app-state/app-state.module'

import { TenantModule } from '../tenant/tenant.module'
import { AuthConfig } from './auth.config'
import { AuthController } from './auth.controller'
import { AuthProvider } from './auth.provider'
import { AuthRegistrationService } from './auth-registration.service'
import { RootAccountProvisioner } from './root-account.service'

@Module({
  imports: [DatabaseModule, SystemSettingModule, SettingModule, TenantModule, AppStateModule],
  controllers: [AuthController],
  providers: [AuthProvider, AuthConfig, AuthRegistrationService, RootAccountProvisioner],
})
export class AuthModule {}
