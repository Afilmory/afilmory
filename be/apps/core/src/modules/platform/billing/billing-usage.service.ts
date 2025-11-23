import { billingUsageEvents } from '@afilmory/db'
import { DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import { normalizeDate } from 'core/helpers/normalize.helper'
import { getTenantContext, requireTenantContext } from 'core/modules/platform/tenant/tenant.context'
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { BillingUsageEventType, BillingUsageUnit } from './billing.constants'
import { DEFAULT_BILLING_USAGE_UNIT } from './billing.constants'

type BillingUsageRow = typeof billingUsageEvents.$inferSelect

export interface BillingUsageEventRecord {
  id: string
  tenantId: string
  eventType: BillingUsageEventType
  quantity: number
  unit: BillingUsageUnit
  metadata: Record<string, unknown> | null
  occurredAt: string
  createdAt: string
  updatedAt: string
}

export interface BillingUsageTotalsEntry {
  eventType: BillingUsageEventType
  totalQuantity: number
  unit: BillingUsageUnit
}

export interface BillingUsageOverview {
  events: BillingUsageEventRecord[]
  totals: BillingUsageTotalsEntry[]
}

export interface BillingUsageOverviewOptions {
  limit?: number
}

export interface BillingUsageQueryOptions {
  since?: Date
  until?: Date
}

export interface BillingUsageEventInput {
  tenantId?: string | null
  eventType: BillingUsageEventType
  quantity?: number
  unit?: BillingUsageUnit
  metadata?: Record<string, unknown> | null
  occurredAt?: Date | string
}

@injectable()
export class BillingUsageService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async recordEvent(input: BillingUsageEventInput): Promise<void> {
    if (!input) {
      return
    }
    await this.recordEvents([input])
  }

  async getUsageTotal(
    tenantId: string,
    eventType: BillingUsageEventType,
    options?: BillingUsageQueryOptions,
  ): Promise<number> {
    const db = this.dbAccessor.get()
    const conditions = [eq(billingUsageEvents.tenantId, tenantId), eq(billingUsageEvents.eventType, eventType)]

    if (options?.since) {
      conditions.push(gte(billingUsageEvents.occurredAt, options.since.toISOString()))
    }

    if (options?.until) {
      conditions.push(lte(billingUsageEvents.occurredAt, options.until.toISOString()))
    }

    const where = conditions.length === 1 ? conditions[0] : and(...conditions)
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${billingUsageEvents.quantity}), 0)` })
      .from(billingUsageEvents)
      .where(where)
      .limit(1)

    return Number(row?.total ?? 0)
  }

  async recordEvents(inputs: readonly BillingUsageEventInput[]): Promise<void> {
    if (inputs.length === 0) {
      return
    }

    const now = new Date()
    const db = this.dbAccessor.get()

    const rows = inputs.map((input) => {
      const tenantId = this.resolveTenantId(input.tenantId)
      const quantity = this.normalizeQuantity(input.quantity)
      const occurredAt = normalizeDate(input.occurredAt) ?? now.toISOString()
      return {
        tenantId,
        eventType: input.eventType,
        quantity,
        unit: input.unit ?? DEFAULT_BILLING_USAGE_UNIT,
        metadata: input.metadata ?? null,
        occurredAt,
      }
    })

    await db.insert(billingUsageEvents).values(rows)
  }

  async getOverview(options?: BillingUsageOverviewOptions): Promise<BillingUsageOverview> {
    const tenant = requireTenantContext()
    const tenantId = tenant.tenant.id
    const limit = this.normalizeLimit(options?.limit)
    const db = this.dbAccessor.get()

    const [events, totals] = await Promise.all([
      db
        .select()
        .from(billingUsageEvents)
        .where(eq(billingUsageEvents.tenantId, tenantId))
        .orderBy(desc(billingUsageEvents.occurredAt))
        .limit(limit),
      db
        .select({
          eventType: billingUsageEvents.eventType,
          unit: billingUsageEvents.unit,
          totalQuantity: sql<number>`coalesce(sum(${billingUsageEvents.quantity}), 0)`,
        })
        .from(billingUsageEvents)
        .where(eq(billingUsageEvents.tenantId, tenantId))
        .groupBy(billingUsageEvents.eventType, billingUsageEvents.unit),
    ])

    return {
      events: events.map((record) => this.mapRow(record)),
      totals: totals.map((row) => ({
        eventType: row.eventType as BillingUsageEventType,
        totalQuantity: Number(row.totalQuantity) || 0,
        unit: row.unit as BillingUsageUnit,
      })),
    }
  }

  async getUsageTotalsForTenants(tenantIds: readonly string[]): Promise<Record<string, BillingUsageTotalsEntry[]>> {
    if (!tenantIds || tenantIds.length === 0) {
      return {}
    }

    const normalizedTenantIds = Array.from(
      new Set(tenantIds.filter((id) => typeof id === 'string' && id.trim().length > 0)),
    )
    if (normalizedTenantIds.length === 0) {
      return {}
    }

    const db = this.dbAccessor.get()

    const rows = await db
      .select({
        tenantId: billingUsageEvents.tenantId,
        eventType: billingUsageEvents.eventType,
        unit: billingUsageEvents.unit,
        totalQuantity: sql<number>`coalesce(sum(${billingUsageEvents.quantity}), 0)`,
      })
      .from(billingUsageEvents)
      .where(inArray(billingUsageEvents.tenantId, normalizedTenantIds))
      .groupBy(billingUsageEvents.tenantId, billingUsageEvents.eventType, billingUsageEvents.unit)

    const totalsByTenant: Record<string, BillingUsageTotalsEntry[]> = {}

    for (const row of rows) {
      const { tenantId } = row
      if (!tenantId) {
        continue
      }

      const current = totalsByTenant[tenantId] ?? []
      current.push({
        eventType: row.eventType as BillingUsageEventType,
        totalQuantity: Number(row.totalQuantity ?? 0),
        unit: row.unit as BillingUsageUnit,
      })
      totalsByTenant[tenantId] = current
    }

    return totalsByTenant
  }

  private mapRow(row: BillingUsageRow): BillingUsageEventRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      eventType: row.eventType as BillingUsageEventType,
      quantity: row.quantity,
      unit: row.unit as BillingUsageUnit,
      metadata: row.metadata ?? null,
      occurredAt: row.occurredAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private normalizeLimit(limit?: number): number {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) {
      return 50
    }
    return Math.min(Math.max(Math.floor(limit), 1), 200)
  }

  private resolveTenantId(explicitTenantId?: string | null): string {
    if (explicitTenantId) {
      return explicitTenantId
    }

    const context = getTenantContext()
    if (!context) {
      throw new BizException(ErrorCode.TENANT_NOT_FOUND, {
        message: '无法确定租户上下文，无法记录计费用量。',
      })
    }

    return context.tenant.id
  }

  private normalizeQuantity(quantity?: number): number {
    if (typeof quantity === 'number' && Number.isFinite(quantity)) {
      return quantity
    }
    return 1
  }
}
