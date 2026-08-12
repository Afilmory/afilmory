import { sha256Hex } from '@afilmory/be-utils'
import { billingProviderEvents, generateId } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { and, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { BillingError } from '../billing.error'
import type { BillingProvider } from '../billing-domain.types'

const ERROR_CODE_MAX_LENGTH = 120

export interface BillingProviderEventInput {
  environment: string
  eventId: string
  externalSubscriptionId: string | null
  payload: Record<string, unknown>
  provider: BillingProvider
  signedAt: string | null
}

export interface RecordedBillingProviderEvent {
  duplicate: boolean
  id: string
}

@injectable()
export class BillingProviderEventService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async record(input: BillingProviderEventInput): Promise<RecordedBillingProviderEvent> {
    const db = this.dbAccessor.get()
    const [created] = await db
      .insert(billingProviderEvents)
      .values({
        id: generateId(),
        provider: input.provider,
        environment: input.environment,
        externalEventId: input.eventId,
        externalSubscriptionId: input.externalSubscriptionId,
        signedAt: input.signedAt,
        payload: input.payload,
        payloadDigest: sha256Hex(JSON.stringify(input.payload)),
      })
      .onConflictDoNothing()
      .returning({ id: billingProviderEvents.id })
    if (created) {
      return { duplicate: false, id: created.id }
    }

    const existing = await db
      .select({ id: billingProviderEvents.id })
      .from(billingProviderEvents)
      .where(
        and(
          eq(billingProviderEvents.provider, input.provider),
          eq(billingProviderEvents.environment, input.environment),
          eq(billingProviderEvents.externalEventId, input.eventId),
        ),
      )
      .limit(1)
      .then(rows => rows[0] ?? null)
    if (!existing) {
      throw new BillingError('BILLING_PROVIDER_EVENT_RECEIPT_FAILED')
    }
    return { duplicate: true, id: existing.id }
  }

  async markProcessed(eventId: string): Promise<void> {
    const now = new Date().toISOString()
    await this.dbAccessor
      .get()
      .update(billingProviderEvents)
      .set({ processingStatus: 'processed', processedAt: now, errorCode: null, updatedAt: now })
      .where(eq(billingProviderEvents.id, eventId))
  }

  async markFailed(eventId: string, error: unknown, fallbackCode: string): Promise<void> {
    await this.dbAccessor
      .get()
      .update(billingProviderEvents)
      .set({
        processingStatus: 'failed',
        processedAt: null,
        errorCode: this.toErrorCode(error, fallbackCode),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(billingProviderEvents.id, eventId))
  }

  async track<T>(
    input: BillingProviderEventInput,
    fallbackCode: string,
    work: () => Promise<T>,
  ): Promise<{ duplicate: boolean, result: T }> {
    const event = await this.record(input)
    try {
      const result = await work()
      await this.markProcessed(event.id)
      return { duplicate: event.duplicate, result }
    }
    catch (error) {
      await this.markFailed(event.id, error, fallbackCode)
      throw error
    }
  }

  private toErrorCode(error: unknown, fallbackCode: string): string {
    if (error instanceof BillingError) {
      return error.code
    }
    return error instanceof Error && error.message ? error.message.slice(0, ERROR_CODE_MAX_LENGTH) : fallbackCode
  }
}
