import './tenant.context'

import { Module } from '@afilmory/framework'
import { DatabaseModule } from 'core/database/database.module'
import { AppStateModule } from 'core/modules/infrastructure/app-state/app-state.module'

import { TenantRepository } from './tenant.repository'
import { TenantService } from './tenant.service'
import { TenantContextResolver } from './tenant-context-resolver.service'

@Module({
  imports: [DatabaseModule, AppStateModule],
  providers: [TenantRepository, TenantService, TenantContextResolver],
})
export class TenantModule {}
