import { systemSettings } from '@afilmory/db'
import { eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { DbAccessor } from '../../database/database.provider'
import type {
  SystemSettingEntryInput,
  SystemSettingKey,
  SystemSettingRecord,
  SystemSettingSetOptions,
} from './system-setting.store.types'

@injectable()
export class SystemSettingStore {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async get(key: SystemSettingKey): Promise<SystemSettingRecord['value']> {
    const record = await this.find(key)
    return record?.value ?? null
  }

  async getMany(keys: readonly SystemSettingKey[]): Promise<Record<SystemSettingKey, SystemSettingRecord['value']>> {
    if (keys.length === 0) {
      return {} as Record<SystemSettingKey, SystemSettingRecord['value']>
    }

    const uniqueKeys = Array.from(new Set(keys))
    const db = this.dbAccessor.get()
    const records = await db.select().from(systemSettings).where(inArray(systemSettings.key, uniqueKeys))

    const map = new Map<SystemSettingKey, SystemSettingRecord>(records.map((record) => [record.key, record]))
    return uniqueKeys.reduce(
      (acc, key) => {
        acc[key] = map.get(key)?.value ?? null
        return acc
      },
      Object.create(null) as Record<SystemSettingKey, SystemSettingRecord['value']>,
    )
  }

  async set(
    key: SystemSettingKey,
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
  }

  async setMany(entries: readonly SystemSettingEntryInput[]): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value ?? null, entry.options ?? {})
    }
  }

  async delete(key: SystemSettingKey): Promise<void> {
    const db = this.dbAccessor.get()
    await db.delete(systemSettings).where(eq(systemSettings.key, key))
  }

  private async find(key: SystemSettingKey): Promise<SystemSettingRecord | null> {
    const db = this.dbAccessor.get()
    const [record] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1)

    return record ?? null
  }
}
