import { env } from '@afilmory/env'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { injectable } from 'tsyringe'

export interface SocialProviderOptions {
  clientId: string
  clientSecret: string
}

export interface SocialProvidersConfig {
  google?: SocialProviderOptions
  github?: SocialProviderOptions
}

export interface AppleAuthOptions {
  appBundleIdentifier: string
  clientId: string
  keyId: string
  privateKey: string
  teamId: string
  webEnabled: boolean
}

export interface AuthModuleOptions {
  prefix: string
  useDrizzle: boolean
  socialProviders: SocialProvidersConfig
  apple?: AppleAuthOptions
  baseDomain: string
  oauthGatewayUrl: string | null
}

@injectable()
export class AuthConfig {
  constructor(private readonly systemSettings: SystemSettingService) {}

  async getOptions(): Promise<AuthModuleOptions> {
    const prefix = '/auth'
    const { socialProviders, baseDomain, oauthGatewayUrl } = await this.systemSettings.getAuthModuleConfig()
    const settings = await this.systemSettings.getSettings()
    const appBundleIdentifier = env.APPLE_APP_BUNDLE_ID ?? settings.oauthAppleAppBundleId
    const webClientId = settings.oauthAppleWebClientId ?? env.APPLE_WEB_CLIENT_ID ?? null
    const teamId = settings.oauthAppleTeamId ?? env.APPLE_TEAM_ID ?? null
    const keyId = settings.oauthAppleKeyId ?? env.APPLE_KEY_ID ?? null
    const privateKey = env.APPLE_PRIVATE_KEY ?? null
    const apple
      = teamId && keyId && privateKey
        ? {
            appBundleIdentifier,
            clientId: webClientId ?? appBundleIdentifier,
            keyId,
            privateKey,
            teamId,
            webEnabled: Boolean(webClientId),
          }
        : undefined

    return {
      prefix,
      useDrizzle: true,
      socialProviders,
      apple,
      baseDomain,
      oauthGatewayUrl,
    }
  }
}
