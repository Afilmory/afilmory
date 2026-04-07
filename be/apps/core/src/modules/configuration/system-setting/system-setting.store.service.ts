import { systemSettings } from '@afilmory/db'
import { EventEmitterService } from '@tsuki/framework'
import { DbAccessor } from 'core/database/database.provider'
import { eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { SystemSettingKey as SystemSettingLiteralKey } from './system-setting.constants'
import type {
  SystemSettingEntryInput,
  SystemSettingKey as SystemSettingStoreKey,
  SystemSettingRecord,
  SystemSettingSetOptions,
} from './system-setting.store.types'

@injectable()
export class SystemSettingStore {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly eventService: EventEmitterService,
  ) {}

  async get(key: SystemSettingStoreKey): Promise<SystemSettingRecord['value']> {
    const record = await this.find(key)
    return record?.value ?? null
  }

  async getMany(
    keys: readonly SystemSettingStoreKey[],
  ): Promise<Record<SystemSettingStoreKey, SystemSettingRecord['value']>> {
    if (keys.length === 0) {
      return {} as Record<SystemSettingStoreKey, SystemSettingRecord['value']>
    }

    const uniqueKeys = Array.from(new Set(keys))
    const db = this.dbAccessor.get()
    const records = await db.select().from(systemSettings).where(inArray(systemSettings.key, uniqueKeys))

    const map = new Map<SystemSettingStoreKey, SystemSettingRecord>(records.map((record) => [record.key, record]))
    return uniqueKeys.reduce(
      (acc, key) => {
        acc[key] = map.get(key)?.value ?? null
        return acc
      },
      Object.create(null) as Record<SystemSettingStoreKey, SystemSettingRecord['value']>,
    )
  }

  async getRaw(key: string): Promise<SystemSettingRecord['value']> {
    const value = await this.findRaw(key)
    return value?.value ?? null
  }

  async set(
    key: SystemSettingStoreKey,
    value: SystemSettingRecord['value'],
    options: SystemSettingSetOptions = {},
  ): Promise<void> {
    const existing = await this.find(key)
    const db = this.dbAccessor.get()

    const sanitizedValue = value ?? null
    const isSensitive = options.isSensitive ?? existing?.isSensitive ?? false
    const description = options.description ?? existing?.description ?? null
    const now = new Date().toISOString()

    await db
      .insert(systemSettings)
      .values({
        key,
        value: sanitizedValue,
        isSensitive,
        description,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: sanitizedValue,
          isSensitive,
          description,
          updatedAt: now,
        },
      })

    this.eventService.emit('system.setting.updated', {
      key: key as SystemSettingLiteralKey,
      value: String(value),
    })
  }

  async setMany(entries: readonly SystemSettingEntryInput[]): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value ?? null, entry.options ?? {})
    }
  }

  async delete(key: SystemSettingStoreKey): Promise<void> {
    const db = this.dbAccessor.get()
    await db.delete(systemSettings).where(eq(systemSettings.key, key))
  }

  private async find(key: SystemSettingStoreKey): Promise<SystemSettingRecord | null> {
    return await this.findRaw(key)
  }

  private async findRaw(key: string): Promise<SystemSettingRecord | null> {
    const db = this.dbAccessor.get()
    const [record] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1)
    return record ?? null
  }
}
