import { injectable } from 'tsyringe'

import { SystemSettingService } from '../system-setting/system-setting.service'

export interface SocialProviderOptions {
  clientId: string
  clientSecret: string
  redirectPath?: string | null
}

export interface SocialProvidersConfig {
  google?: SocialProviderOptions
  github?: SocialProviderOptions
}

export interface AuthModuleOptions {
  prefix: string
  useDrizzle: boolean
  socialProviders: SocialProvidersConfig
  baseDomain: string
}

@injectable()
export class AuthConfig {
  constructor(private readonly systemSettings: SystemSettingService) {}

  async getOptions(): Promise<AuthModuleOptions> {
    const prefix = '/auth'
    const { socialProviders, baseDomain } = await this.systemSettings.getAuthModuleConfig()

    return {
      prefix,
      useDrizzle: true,
      socialProviders,
      baseDomain,
    }
  }
}
