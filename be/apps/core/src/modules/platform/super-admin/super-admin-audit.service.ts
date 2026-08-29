import { superAdminAuditLogs } from '@afilmory/db'
import type { HttpContextAuth } from '@core/context/http-context.values'
import { DbAccessor } from '@core/database/database.provider'
import { HttpContext } from '@tsuki-hono/common'
import type { SQL } from 'drizzle-orm'
import { and, count, desc, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { injectable } from 'tsyringe'

const SENSITIVE_KEYS = /password|secret|token|credential|authorization|cookie/i

export function sanitizeAuditSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditSnapshot)
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEYS.test(key))
      .map(([key, entry]) => [key, sanitizeAuditSnapshot(entry)]),
  )
}

@injectable()
export class SuperAdminAuditService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  getActorUserId(): string | null {
    try {
      const auth = HttpContext.getValue('auth') as HttpContextAuth | undefined
      return auth?.user?.id ?? null
    }
    catch {
      return null
    }
  }

  getRequestId(): string | null {
    try {
      const context = HttpContext.getValue('hono') as Context | undefined
      return context?.req.header('x-request-id') ?? null
    }
    catch {
      return null
    }
  }

  async record(input: {
    action: string
    targetType: string
    targetId: string
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    requestId?: string | null
    batchId?: string | null
    result?: 'success' | 'skipped' | 'failed'
    errorCode?: string | null
  }): Promise<void> {
    await this.dbAccessor
      .get()
      .insert(superAdminAuditLogs)
      .values({
        actorUserId: this.getActorUserId(),
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        before: sanitizeAuditSnapshot(input.before ?? null) as Record<string, unknown> | null,
        after: sanitizeAuditSnapshot(input.after ?? null) as Record<string, unknown> | null,
        requestId: input.requestId ?? this.getRequestId(),
        batchId: input.batchId ?? null,
        result: input.result ?? 'success',
        errorCode: input.errorCode ?? null,
      })
  }

  async run<T>(
    input: {
      action: string
      targetType: string
      targetId: string
      before?: Record<string, unknown> | null
      batchId?: string | null
    },
    operation: () => Promise<T>,
    summarize?: (result: T) => {
      before?: Record<string, unknown> | null
      after?: Record<string, unknown> | null
    },
  ): Promise<T> {
    try {
      const result = await operation()
      const snapshots = summarize?.(result)
      await this.record({
        ...input,
        before: snapshots?.before ?? input.before ?? null,
        after: snapshots?.after ?? null,
        result: 'success',
      })
      return result
    }
    catch (error) {
      const errorCode
        = error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : error instanceof Error
            ? error.name
            : 'unknown'
      await this.record({
        ...input,
        result: 'failed',
        errorCode,
      })
      throw error
    }
  }

  async list(query: {
    page: number
    limit: number
    actorUserId?: string
    targetType?: string
    targetId?: string
    action?: string
  }) {
    const conditions: SQL[] = []
    if (query.actorUserId)
      conditions.push(eq(superAdminAuditLogs.actorUserId, query.actorUserId))
    if (query.targetType)
      conditions.push(eq(superAdminAuditLogs.targetType, query.targetType))
    if (query.targetId)
      conditions.push(eq(superAdminAuditLogs.targetId, query.targetId))
    if (query.action)
      conditions.push(eq(superAdminAuditLogs.action, query.action))
    const where = conditions.length > 0 ? and(...conditions) : undefined
    const db = this.dbAccessor.get()
    const [logs, total] = await Promise.all([
      db
        .select()
        .from(superAdminAuditLogs)
        .where(where)
        .orderBy(desc(superAdminAuditLogs.occurredAt))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      db.select({ total: count() }).from(superAdminAuditLogs).where(where),
    ])
    return { logs, total: Number(total[0]?.total ?? 0) }
  }
}
