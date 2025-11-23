import type { ManagedStorageMetadata } from '@afilmory/db'
import { managedStorageFileReferences, managedStorageUsages } from '@afilmory/db'
import { DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import {
  normalizeDate,
  normalizeInteger,
  normalizeNumber,
  normalizeString,
  requireString,
} from 'core/helpers/normalize.helper'
import { requireTenantContext } from 'core/modules/platform/tenant/tenant.context'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

export interface ManagedStorageUsageSnapshotInput {
  tenantId?: string | null
  providerKey: string
  totalBytes: number
  operation?: string | null
  fileCount?: number
  recordedAt?: Date | string
  periodStart?: Date | string | null
  periodEnd?: Date | string | null
}

export interface ManagedStorageFileReferenceInput {
  tenantId?: string | null
  providerKey: string
  storageProvider?: string | null
  storageKey: string
  size?: number | null
  contentType?: string | null
  etag?: string | null
  referenceType?: string | null
  referenceId?: string | null
  metadata?: ManagedStorageMetadata | null
}

@injectable()
export class ManagedStorageService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async recordUsageSnapshot(input: ManagedStorageUsageSnapshotInput): Promise<void> {
    const tenantId = this.resolveTenantId(input.tenantId)
    const now = new Date().toISOString()

    const payload: typeof managedStorageUsages.$inferInsert = {
      tenantId,
      providerKey: requireString(input.providerKey, 'providerKey'),
      operation: normalizeString(input.operation),
      totalBytes: normalizeNumber(input.totalBytes),
      fileCount: normalizeInteger(input.fileCount),
      periodStart: normalizeDate(input.periodStart),
      periodEnd: normalizeDate(input.periodEnd),
      recordedAt: normalizeDate(input.recordedAt) ?? now,
      createdAt: now,
      updatedAt: now,
    }

    const db = this.dbAccessor.get()
    await db.insert(managedStorageUsages).values(payload)
  }

  async getUsageTotals(
    providerKey: string,
    tenantId?: string | null,
  ): Promise<{ totalBytes: number; fileCount: number }> {
    const resolvedTenantId = this.resolveTenantId(tenantId)
    const normalizedProviderKey = requireString(providerKey, 'providerKey')
    const db = this.dbAccessor.get()

    const [row] = await db
      .select({
        totalBytes: sql<number>`coalesce(sum(${managedStorageFileReferences.size}), 0)`,
        fileCount: sql<number>`count(*)`,
      })
      .from(managedStorageFileReferences)
      .where(
        and(
          eq(managedStorageFileReferences.tenantId, resolvedTenantId),
          eq(managedStorageFileReferences.providerKey, normalizedProviderKey),
        ),
      )

    return {
      totalBytes: Number(row?.totalBytes ?? 0),
      fileCount: Number(row?.fileCount ?? 0),
    }
  }

  async deleteFileReferences(providerKey: string, storageKeys: string[], tenantId?: string | null): Promise<void> {
    const resolvedTenantId = this.resolveTenantId(tenantId)
    const normalizedProviderKey = requireString(providerKey, 'providerKey')
    const normalizedKeys = storageKeys
      .map((key) => this.normalizeStorageKey(key))
      .filter((key): key is string => typeof key === 'string' && key.length > 0)

    if (normalizedKeys.length === 0) {
      return
    }

    const db = this.dbAccessor.get()
    await db
      .delete(managedStorageFileReferences)
      .where(
        and(
          eq(managedStorageFileReferences.tenantId, resolvedTenantId),
          eq(managedStorageFileReferences.providerKey, normalizedProviderKey),
          inArray(managedStorageFileReferences.storageKey, normalizedKeys),
        ),
      )
  }

  async upsertFileReference(input: ManagedStorageFileReferenceInput): Promise<void> {
    const tenantId = this.resolveTenantId(input.tenantId)
    const now = new Date().toISOString()
    const storageKey = this.normalizeStorageKey(input.storageKey)

    const insertPayload: typeof managedStorageFileReferences.$inferInsert = {
      tenantId,
      providerKey: requireString(input.providerKey, 'providerKey'),
      storageProvider: normalizeString(input.storageProvider),
      storageKey,
      size: normalizeNumber(input.size),
      contentType: normalizeString(input.contentType),
      etag: normalizeString(input.etag),
      referenceType: normalizeString(input.referenceType),
      referenceId: normalizeString(input.referenceId),
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    }

    const updatePayload: Partial<typeof managedStorageFileReferences.$inferInsert> = {
      providerKey: insertPayload.providerKey,
      updatedAt: now,
    }

    if (input.storageProvider !== undefined) {
      updatePayload.storageProvider = insertPayload.storageProvider
    }
    if (input.size !== undefined) {
      updatePayload.size = insertPayload.size
    }
    if (input.contentType !== undefined) {
      updatePayload.contentType = insertPayload.contentType
    }
    if (input.etag !== undefined) {
      updatePayload.etag = insertPayload.etag
    }
    if (input.referenceType !== undefined) {
      updatePayload.referenceType = insertPayload.referenceType
    }
    if (input.referenceId !== undefined) {
      updatePayload.referenceId = insertPayload.referenceId
    }
    if (input.metadata !== undefined) {
      updatePayload.metadata = insertPayload.metadata
    }

    const db = this.dbAccessor.get()
    await db
      .insert(managedStorageFileReferences)
      .values(insertPayload)
      .onConflictDoUpdate({
        target: [managedStorageFileReferences.tenantId, managedStorageFileReferences.storageKey],
        set: updatePayload,
      })
  }

  private resolveTenantId(explicitTenantId?: string | null): string {
    if (explicitTenantId) {
      return explicitTenantId
    }
    const context = requireTenantContext()
    return context.tenant.id
  }

  private normalizeStorageKey(value: string | undefined): string {
    const normalized = normalizeString(value)
    if (!normalized) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少有效的 storageKey' })
    }
    return normalized.replaceAll('\\', '/').replace(/^\/+/, '')
  }
}
