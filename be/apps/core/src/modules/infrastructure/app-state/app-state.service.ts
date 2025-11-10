import { systemSettings } from '@afilmory/db'
import { DbAccessor } from 'core/database/database.provider'
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

const APP_INITIALIZED_KEY = 'system.app.initialized'

@injectable()
export class AppStateService {
  private cachedInitialized: boolean | null = null

  constructor(private readonly dbAccessor: DbAccessor) {}

  async isInitialized(): Promise<boolean> {
    if (this.cachedInitialized) {
      return true
    }

    const db = this.dbAccessor.get()
    const [record] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, APP_INITIALIZED_KEY))
      .limit(1)

    const initialized = record?.value === true
    if (initialized) {
      this.cachedInitialized = true
    }
    return initialized
  }

  async markInitialized(): Promise<void> {
    if (this.cachedInitialized) {
      return
    }

    const db = this.dbAccessor.get()
    await db
      .insert(systemSettings)
      .values({
        key: APP_INITIALIZED_KEY,
        value: true,
        isSensitive: false,
        description: 'Indicates whether the application completed its initial setup.',
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: true,
          updatedAt: new Date().toISOString(),
        },
      })

    this.cachedInitialized = true
  }
}
