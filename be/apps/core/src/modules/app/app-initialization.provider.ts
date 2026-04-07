import type { OnModuleInit } from '@tsuki/framework'
import { createLogger } from '@tsuki/framework'
import { AppStateService } from 'core/modules/app/app-state/app-state.service'
import { TenantService } from 'core/modules/platform/tenant/tenant.service'
import { injectable } from 'tsyringe'

import { RootAccountProvisioner } from '../platform/auth/root-account.service'

const log = createLogger('AppInitialization')

@injectable()
export class AppInitializationProvider implements OnModuleInit {
  constructor(
    private readonly appState: AppStateService,
    private readonly tenantService: TenantService,
    private readonly rootAccountProvisioner: RootAccountProvisioner,
  ) {}

  async onModuleInit(): Promise<void> {
    const rootTenant = await this.tenantService.ensureRootTenant()
    const initialized = await this.appState.isInitialized()

    if (!initialized) {
      log.info('Application not initialized. Provisioning root tenant and superadmin account...')
      await this.rootAccountProvisioner.ensureRootAccount(rootTenant.tenant.id)
      await this.appState.markInitialized()
      log.info('Application initialization completed.')
      return
    }

    await this.rootAccountProvisioner.ensureRootAccount(rootTenant.tenant.id)
  }
}
