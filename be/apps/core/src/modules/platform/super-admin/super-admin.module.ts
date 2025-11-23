import { Module } from '@afilmory/framework'
import { DatabaseModule } from 'core/database/database.module'
import { SystemSettingModule } from 'core/modules/configuration/system-setting/system-setting.module'
import { PhotoBuilderService } from 'core/modules/content/photo/builder/photo-builder.service'
import { BillingModule } from 'core/modules/platform/billing/billing.module'
import { TenantModule } from 'core/modules/platform/tenant/tenant.module'

import { SuperAdminBuilderDebugController } from './super-admin-builder.controller'
import { SuperAdminSettingController } from './super-admin-settings.controller'
import { SuperAdminTenantController } from './super-admin-tenants.controller'

@Module({
  imports: [SystemSettingModule, BillingModule, TenantModule, DatabaseModule],
  controllers: [SuperAdminSettingController, SuperAdminBuilderDebugController, SuperAdminTenantController],
  providers: [PhotoBuilderService],
})
export class SuperAdminModule {}
