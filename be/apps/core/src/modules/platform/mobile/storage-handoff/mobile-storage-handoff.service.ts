import { randomBytes, randomUUID } from 'node:crypto'

import { sha256Hex } from '@afilmory/be-utils'
import { StorageFactory } from '@afilmory/builder/storage/index.js'
import { mobileStorageHandoffs, tenantMemberships, tenants } from '@afilmory/db'
import { env } from '@afilmory/env'
import { STORAGE_PROVIDER_SECRET_PLACEHOLDER } from '@afilmory/utils'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import type { SettingEntryInput } from '@core/modules/configuration/setting/setting.service'
import { SettingService } from '@core/modules/configuration/setting/setting.service'
import type { StorageSettingKey } from '@core/modules/configuration/setting/storage-provider.constants'
import {
  STORAGE_ACTIVE_PROVIDER_SETTING_KEY,
  STORAGE_PROVIDERS_SETTING_KEY,
  STORAGE_SETTING_KEYS,
} from '@core/modules/configuration/setting/storage-provider.constants'
import type { BuilderStorageProvider } from '@core/modules/configuration/setting/storage-provider.utils'
import { parseStorageProviders } from '@core/modules/configuration/setting/storage-provider.utils'
import { StorageSettingService } from '@core/modules/configuration/storage-setting/storage-setting.service'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { PhotoStorageService } from '@core/modules/content/photo/storage/photo-storage.service'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'

const HANDOFF_LIFETIME_MS = 10 * 60 * 1000
const CAPABILITY_LIFETIME_MS = 15 * 60 * 1000
const CONNECTION_TEST_TIMEOUT_MS = 12_000

@injectable()
export class MobileStorageHandoffService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly settings: SettingService,
    private readonly storageSettings: StorageSettingService,
    private readonly systemSettings: SystemSettingService,
    private readonly photoStorage: PhotoStorageService,
  ) {}

  async create(input: { tenantId: string, userId: string }) {
    await this.requireAuthorizedMembership(input.tenantId, input.userId)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + HANDOFF_LIFETIME_MS).toISOString()
    await this.dbAccessor
      .get()
      .insert(mobileStorageHandoffs)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        tokenHash: sha256Hex(token),
        status: 'issued',
        expiresAt,
      })
    const url = await this.buildSetupUrl(token)
    return { expiresAt, setupUrl: url.toString() }
  }

  async exchange(code: string) {
    const db = this.dbAccessor.get()
    const now = new Date().toISOString()
    const handoff = await db
      .select()
      .from(mobileStorageHandoffs)
      .where(
        and(
          eq(mobileStorageHandoffs.tokenHash, sha256Hex(code)),
          eq(mobileStorageHandoffs.status, 'issued'),
          gt(mobileStorageHandoffs.expiresAt, now),
        ),
      )
      .limit(1)
      .then(rows => rows[0] ?? null)
    if (!handoff) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: 'This storage setup link is invalid or expired.',
      })
    }
    await this.requireAuthorizedMembership(handoff.tenantId, handoff.userId)
    const capabilityToken = randomBytes(32).toString('base64url')
    const capabilityExpiresAt = new Date(Date.now() + CAPABILITY_LIFETIME_MS).toISOString()
    const [exchanged] = await db
      .update(mobileStorageHandoffs)
      .set({
        capabilityTokenHash: sha256Hex(capabilityToken),
        capabilityExpiresAt,
        exchangedAt: now,
        status: 'exchanged',
        updatedAt: now,
      })
      .where(and(eq(mobileStorageHandoffs.id, handoff.id), eq(mobileStorageHandoffs.status, 'issued')))
      .returning()
    if (!exchanged) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, { message: 'This storage setup link was already used.' })
    }
    const tenant = await db
      .select({ name: tenants.name, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, handoff.tenantId))
      .limit(1)
      .then(rows => rows[0] ?? null)
    return {
      capabilityExpiresAt,
      capabilityToken,
      returnUrl: env.MOBILE_STORAGE_HANDOFF_RETURN_URL,
      workspace: tenant,
    }
  }

  async getContext(capabilityToken: string) {
    const handoff = await this.requireCapability(capabilityToken)
    const schema = await this.storageSettings.getUiSchema({ tenantId: handoff.tenantId })
    const values = await this.storageSettings.getMany(STORAGE_SETTING_KEYS, { tenantId: handoff.tenantId })
    const tenant = await this.dbAccessor
      .get()
      .select({ name: tenants.name, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, handoff.tenantId))
      .limit(1)
      .then(rows => rows[0] ?? null)
    return {
      capabilityExpiresAt: handoff.capabilityExpiresAt,
      providerForm: schema.providerForm,
      returnUrl: env.MOBILE_STORAGE_HANDOFF_RETURN_URL,
      values,
      workspace: tenant,
    }
  }

  async testConnection(capabilityToken: string, provider: BuilderStorageProvider): Promise<{ connected: true }> {
    const handoff = await this.requireCapability(capabilityToken)
    const existing = (await this.settings.getStorageProvidersRaw({ tenantId: handoff.tenantId })).find(
      candidate => candidate.id === provider.id,
    )
    const resolvedProvider: BuilderStorageProvider = {
      ...provider,
      config: Object.fromEntries(
        Object.entries(provider.config).map(([key, value]) => [
          key,
          value === STORAGE_PROVIDER_SECRET_PLACEHOLDER ? (existing?.config[key] ?? value) : value,
        ]),
      ),
    }
    const config = this.photoStorage.mapProviderToStorageConfig(resolvedProvider)
    const storage = StorageFactory.createProvider(config)
    await this.withTimeout(storage.getFile(`.afilmory-connection-test/${randomUUID()}`))
    return { connected: true }
  }

  async save(
    capabilityToken: string,
    entries: Array<{ key: StorageSettingKey, value: string }>,
  ): Promise<{ completed: true, returnUrl: string }> {
    const handoff = await this.requireCapability(capabilityToken)
    const values = new Map(entries.map(entry => [entry.key, entry.value]))
    const providers = parseStorageProviders(values.get(STORAGE_PROVIDERS_SETTING_KEY) ?? '')
    const activeProviderId = values.get(STORAGE_ACTIVE_PROVIDER_SETTING_KEY)?.trim()
    const activeProvider = providers.find(provider => provider.id === activeProviderId)
    if (!activeProvider) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: 'Save a valid active storage provider before completing setup.',
      })
    }
    await this.testConnection(capabilityToken, activeProvider)
    const normalized = entries.map(entry => ({
      key: entry.key,
      value: entry.value,
      options: { tenantId: handoff.tenantId },
    })) as SettingEntryInput[]
    await this.storageSettings.setMany(normalized)
    const configuredActiveProvider = await this.settings.getActiveStorageProvider({ tenantId: handoff.tenantId })
    if (!configuredActiveProvider) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: 'Save a valid active storage provider before completing setup.',
      })
    }
    const now = new Date().toISOString()
    const [completed] = await this.dbAccessor
      .get()
      .update(mobileStorageHandoffs)
      .set({ completedAt: now, status: 'completed', updatedAt: now })
      .where(and(eq(mobileStorageHandoffs.id, handoff.id), eq(mobileStorageHandoffs.status, 'exchanged')))
      .returning({ id: mobileStorageHandoffs.id })
    if (!completed) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, { message: 'This storage setup capability was already used.' })
    }
    return { completed: true, returnUrl: env.MOBILE_STORAGE_HANDOFF_RETURN_URL }
  }

  private async requireCapability(capabilityToken: string) {
    const now = new Date().toISOString()
    const handoff = await this.dbAccessor
      .get()
      .select()
      .from(mobileStorageHandoffs)
      .where(
        and(
          eq(mobileStorageHandoffs.capabilityTokenHash, sha256Hex(capabilityToken)),
          eq(mobileStorageHandoffs.status, 'exchanged'),
          gt(mobileStorageHandoffs.capabilityExpiresAt, now),
        ),
      )
      .limit(1)
      .then(rows => rows[0] ?? null)
    if (!handoff) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, { message: 'Storage setup capability is invalid or expired.' })
    }
    await this.requireAuthorizedMembership(handoff.tenantId, handoff.userId)
    return handoff
  }

  private async requireAuthorizedMembership(tenantId: string, userId: string): Promise<void> {
    const membership = await this.dbAccessor
      .get()
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.userId, userId),
          eq(tenantMemberships.status, 'active'),
          inArray(tenantMemberships.role, ['admin', 'owner']),
        ),
      )
      .limit(1)
      .then(rows => rows[0] ?? null)
    if (!membership) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
        message: 'Workspace administration permission is required for storage setup.',
      })
    }
  }

  private async buildSetupUrl(token: string): Promise<URL> {
    let baseUrl = env.MOBILE_STORAGE_HANDOFF_WEB_ORIGIN
    if (!baseUrl) {
      if (env.NODE_ENV === 'production') {
        const settings = await this.systemSettings.getSettings()
        baseUrl = `https://${settings.baseDomain}/platform/`
      }
      else {
        baseUrl = 'http://localhost:5173/'
      }
    }
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    const url = new URL('storage-handoff', normalizedBase)
    url.searchParams.set('code', token)
    return url
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('STORAGE_CONNECTION_TEST_TIMEOUT')), CONNECTION_TEST_TIMEOUT_MS)
      timeoutId.unref?.()
    })
    try {
      return await Promise.race([operation, timeout])
    }
    finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }
}
