import { DatabaseModule } from '@core/database/database.module'
import { AppStateModule } from '@core/modules/app/app-state/app-state.module'
import { SettingModule } from '@core/modules/configuration/setting/setting.module'
import { SystemSettingModule } from '@core/modules/configuration/system-setting/system-setting.module'
import { BillingModule } from '@core/modules/platform/billing/billing.module'
import { Module } from '@tsuki-hono/common'

import { TenantModule } from '../tenant/tenant.module'
import { AppleAuthController } from './apple-auth.controller'
import { AppleAuthorizationService } from './apple-authorization.service'
import { AppleClientSecretService } from './apple-client-secret.service'
import { AppleCredentialCipher } from './apple-credential-cipher.service'
import { AuthConfig } from './auth.config'
import { AuthController } from './auth.controller'
import { AuthProvider } from './auth.provider'
import { AuthRegistrationService } from './auth-registration.service'
import { WorkspaceMembershipService } from './workspace-membership.service'

@Module({
  imports: [DatabaseModule, SystemSettingModule, SettingModule, TenantModule, AppStateModule, BillingModule],
  controllers: [AuthController, AppleAuthController],
  providers: [
    AuthProvider,
    AuthConfig,
    AuthRegistrationService,
    WorkspaceMembershipService,
    AppleAuthorizationService,
    AppleClientSecretService,
    AppleCredentialCipher,
  ],
})
export class AuthModule {}
