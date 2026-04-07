import { Module } from '@tsuki/framework'

import { AuthModule } from '../platform/auth/auth.module'
import { RootAccountProvisioner } from '../platform/auth/root-account.service'
import { TenantModule } from '../platform/tenant/tenant.module'
import { AppInitializationProvider } from './app-initialization.provider'
import { AppStateModule } from './app-state/app-state.module'

@Module({
  imports: [AppStateModule, TenantModule, AuthModule],
  providers: [AppInitializationProvider, RootAccountProvisioner],
})
export class AppInitializationModule {}
