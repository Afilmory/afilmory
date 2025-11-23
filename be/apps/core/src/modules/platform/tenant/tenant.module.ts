import './tenant.context'

import { Module } from '@afilmory/framework'
import { DatabaseModule } from 'core/database/database.module'
import { AppStateModule } from 'core/modules/app/app-state/app-state.module'
import { SystemSettingModule } from 'core/modules/configuration/system-setting/system-setting.module'

import { TenantController } from './tenant.controller'
import { TenantRepository } from './tenant.repository'
import { TenantService } from './tenant.service'
import { TenantContextResolver } from './tenant-context-resolver.service'
import { TenantDomainRepository } from './tenant-domain.repository'
import { TenantDomainService } from './tenant-domain.service'

@Module({
  imports: [DatabaseModule, AppStateModule, SystemSettingModule],
  controllers: [TenantController],
  providers: [TenantRepository, TenantDomainRepository, TenantService, TenantDomainService, TenantContextResolver],
})
export class TenantModule {}
