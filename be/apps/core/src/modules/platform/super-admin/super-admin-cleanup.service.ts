import type { CleanupCriteria } from '@afilmory/db'
import { generateId, tenantCleanupBatches, tenantCleanupItems, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { AccountDeletionRequestService } from '@core/modules/platform/account-deletion/account-deletion-request.service'
import { DataManagementService } from '@core/modules/platform/data-management/data-management.service'
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { CleanupCandidate, CleanupMode, CleanupSubjectType } from './cleanup/cleanup.shared'
import {
  buildCleanupConfirmation,
  calculateDeletionDueAt,
  calculateInactiveCutoff,
  hasReactivatedSince,
  normalizeCriteria,
} from './cleanup/cleanup.shared'
import { CleanupCandidatesService } from './cleanup/cleanup-candidates.service'
import { SuperAdminAuditService } from './super-admin-audit.service'

export interface ExecuteCleanupInput {
  subjectType: CleanupSubjectType
  mode: CleanupMode
  criteria: Partial<CleanupCriteria>
  ids: string[]
  confirmation: string
}

@injectable()
export class SuperAdminCleanupService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly candidates: CleanupCandidatesService,
    private readonly dataManagement: DataManagementService,
    private readonly accountDeletion: AccountDeletionRequestService,
    private readonly audit: SuperAdminAuditService,
  ) {}

  async preview(subjectType: CleanupSubjectType, rawCriteria: Partial<CleanupCriteria>) {
    const criteria = normalizeCriteria(rawCriteria)
    const candidates = await this.candidates.list(subjectType, criteria)
    return {
      subjectType,
      criteria,
      candidates,
      total: candidates.length,
      cutoff: calculateInactiveCutoff(new Date(), criteria.inactiveMonths).toISOString(),
      suspendConfirmation: buildCleanupConfirmation('suspend', subjectType, candidates.length),
      deleteConfirmation: buildCleanupConfirmation('delete', subjectType, candidates.length),
    }
  }

  async execute(input: ExecuteCleanupInput) {
    const criteria = normalizeCriteria(input.criteria)
    const uniqueIds = [...new Set(input.ids)]
    const expected = buildCleanupConfirmation(input.mode, input.subjectType, uniqueIds.length)
    if (input.confirmation !== expected) {
      throw new BizException(ErrorCode.COMMON_VALIDATION, { message: `请输入 ${expected} 以确认操作。` })
    }

    const eligible = await this.candidates.list(input.subjectType, criteria, uniqueIds)
    const candidateMap = new Map(eligible.map(candidate => [candidate.id, candidate]))
    const batchId = await this.openBatch({
      subjectType: input.subjectType,
      mode: input.mode,
      criteria,
      ids: uniqueIds,
      candidateMap,
    })

    let suspendedCount = 0
    let deletedCount = 0
    let skippedCount = 0
    let failedCount = 0

    for (const id of uniqueIds) {
      const candidate = candidateMap.get(id)
      if (!candidate) {
        skippedCount += 1
        await this.finishItem(batchId, id, 'skipped', 'no-longer-eligible')
        await this.recordAudit(input, batchId, id, 'skipped', { reason: 'no-longer-eligible' })
        continue
      }

      try {
        if (input.mode === 'suspend') {
          await this.suspendSubject(input.subjectType, id)
          suspendedCount += 1
          await this.finishItem(batchId, id, 'suspended', null)
          await this.recordAudit(input, batchId, id, 'success', { suspended: true }, candidate)
        }
        else {
          await this.deleteSubject(input.subjectType, id)
          deletedCount += 1
          await this.finishItem(batchId, id, 'deleted', null)
          await this.recordAudit(input, batchId, id, 'success', { deleted: true }, candidate)
        }
      }
      catch (error) {
        failedCount += 1
        const errorCode = error instanceof BizException ? String(error.code) : 'unknown'
        await this.finishItem(
          batchId,
          id,
          'failed',
          error instanceof Error ? error.message : 'unknown error',
          errorCode,
        )
        await this.recordAudit(input, batchId, id, 'failed', undefined, candidate, errorCode)
      }
    }

    const completedAt = new Date().toISOString()
    await this.dbAccessor
      .get()
      .update(tenantCleanupBatches)
      .set({
        status: failedCount > 0 ? 'completed_with_errors' : 'completed',
        suspendedCount,
        deletedCount,
        skippedCount,
        failedCount,
        completedAt,
      })
      .where(eq(tenantCleanupBatches.id, batchId))

    return { batchId, suspendedCount, deletedCount, skippedCount, failedCount, completedAt }
  }

  async listPending() {
    const db = this.dbAccessor.get()
    const rows = await db
      .select({
        id: tenantCleanupItems.id,
        batchId: tenantCleanupItems.batchId,
        subjectType: tenantCleanupItems.subjectType,
        tenantId: tenantCleanupItems.tenantId,
        userId: tenantCleanupItems.userId,
        subjectLabel: tenantCleanupItems.subjectLabel,
        tenantSlug: tenantCleanupItems.tenantSlug,
        suspendedAt: tenantCleanupItems.completedAt,
        criteria: tenantCleanupBatches.criteria,
      })
      .from(tenantCleanupItems)
      .innerJoin(tenantCleanupBatches, eq(tenantCleanupBatches.id, tenantCleanupItems.batchId))
      .where(and(eq(tenantCleanupItems.status, 'suspended'), isNotNull(tenantCleanupItems.completedAt)))
      .orderBy(asc(tenantCleanupItems.completedAt))

    return rows.map((row) => {
      const criteria = normalizeCriteria(row.criteria)
      return {
        ...row,
        minSuspendedDays: criteria.minSuspendedDays,
        dueAt: calculateDeletionDueAt(row.suspendedAt!, criteria.minSuspendedDays).toISOString(),
      }
    })
  }

  async cancelPending(itemId: string) {
    const db = this.dbAccessor.get()
    const [item] = await db.select().from(tenantCleanupItems).where(eq(tenantCleanupItems.id, itemId)).limit(1)
    if (!item || item.status !== 'suspended') {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '待删除记录不存在或已处理' })
    }
    await this.restoreSubject(item.subjectType as CleanupSubjectType, item.tenantId, item.userId)
    await db
      .update(tenantCleanupItems)
      .set({ status: 'cancelled', reason: 'cancelled-by-admin' })
      .where(eq(tenantCleanupItems.id, itemId))
    await this.audit.record({
      action: 'cleanup.cancel',
      targetType: item.subjectType,
      targetId: item.tenantId ?? item.userId ?? itemId,
      batchId: item.batchId,
      after: { cancelled: true },
    })
  }

  async sweep(now = new Date()): Promise<{ deleted: number, reactivated: number, failed: number }> {
    const pending = await this.listPending()
    let deleted = 0
    let reactivated = 0
    let failed = 0

    for (const item of pending) {
      if (new Date(item.dueAt).getTime() > now.getTime()) {
        continue
      }
      const subjectType = item.subjectType as CleanupSubjectType
      const subjectId = subjectType === 'tenant' ? item.tenantId : item.userId
      if (!subjectId) {
        continue
      }

      const lastActivityAt = await this.candidates.resolveLastActivity(subjectType, subjectId)
      if (lastActivityAt === null || hasReactivatedSince(item.suspendedAt!, lastActivityAt)) {
        await this.restoreSubject(subjectType, item.tenantId, item.userId)
        await this.dbAccessor
          .get()
          .update(tenantCleanupItems)
          .set({
            status: 'reactivated',
            reason: lastActivityAt === null ? 'subject-missing' : 'activity-after-suspend',
          })
          .where(eq(tenantCleanupItems.id, item.id))
        reactivated += 1
        await this.audit.record({
          action: 'cleanup.sweep',
          targetType: subjectType,
          targetId: subjectId,
          batchId: item.batchId,
          result: 'skipped',
          after: { reactivated: true, lastActivityAt },
        })
        continue
      }

      try {
        await this.deleteSubject(subjectType, subjectId)
        deleted += 1
        await this.dbAccessor
          .get()
          .update(tenantCleanupItems)
          .set({ status: 'deleted', completedAt: new Date().toISOString() })
          .where(eq(tenantCleanupItems.id, item.id))
        await this.audit.record({
          action: 'cleanup.sweep',
          targetType: subjectType,
          targetId: subjectId,
          batchId: item.batchId,
          after: { deleted: true },
        })
      }
      catch (error) {
        failed += 1
        const errorCode = error instanceof BizException ? String(error.code) : 'unknown'
        await this.dbAccessor
          .get()
          .update(tenantCleanupItems)
          .set({ reason: error instanceof Error ? error.message : 'unknown error', errorCode })
          .where(eq(tenantCleanupItems.id, item.id))
        await this.audit.record({
          action: 'cleanup.sweep',
          targetType: subjectType,
          targetId: subjectId,
          batchId: item.batchId,
          result: 'failed',
          errorCode,
        })
      }
    }

    return { deleted, reactivated, failed }
  }

  async getBatch(batchId: string) {
    const db = this.dbAccessor.get()
    const [batch] = await db.select().from(tenantCleanupBatches).where(eq(tenantCleanupBatches.id, batchId)).limit(1)
    if (!batch) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '清理批次不存在' })
    }
    const items = await db.select().from(tenantCleanupItems).where(eq(tenantCleanupItems.batchId, batchId))
    return { batch, items }
  }

  async listBatches(limit = 20) {
    return await this.dbAccessor
      .get()
      .select()
      .from(tenantCleanupBatches)
      .orderBy(desc(tenantCleanupBatches.createdAt))
      .limit(limit)
  }

  private async openBatch(params: {
    subjectType: CleanupSubjectType
    mode: CleanupMode
    criteria: CleanupCriteria
    ids: string[]
    candidateMap: Map<string, CleanupCandidate>
  }): Promise<string> {
    const batchId = generateId()
    const db = this.dbAccessor.get()
    await db.insert(tenantCleanupBatches).values({
      id: batchId,
      actorUserId: this.audit.getActorUserId(),
      subjectType: params.subjectType,
      mode: params.mode,
      criteria: params.criteria,
      inactiveMonths: params.criteria.inactiveMonths,
      candidateCount: params.ids.length,
    })
    await db.insert(tenantCleanupItems).values(
      params.ids.map((id) => {
        const candidate = params.candidateMap.get(id)
        return {
          batchId,
          subjectType: params.subjectType,
          tenantId: params.subjectType === 'tenant' ? id : null,
          tenantSlug: params.subjectType === 'tenant' ? (candidate?.secondaryLabel ?? id) : null,
          userId: params.subjectType === 'user' ? id : null,
          subjectLabel: candidate?.label ?? id,
          lastActivityAt: candidate?.lastActivityAt ?? null,
          status: candidate ? 'pending' : 'skipped',
          reason: candidate ? null : 'no-longer-eligible',
        }
      }),
    )
    return batchId
  }

  private async suspendSubject(subjectType: CleanupSubjectType, id: string) {
    if (subjectType !== 'tenant') {
      return
    }
    await this.dbAccessor
      .get()
      .update(tenants)
      .set({ status: 'suspended', updatedAt: new Date().toISOString() })
      .where(eq(tenants.id, id))
  }

  // Restores to 'active' rather than the pre-suspension status: a subject only comes back
  // because its owner signed in again, which makes 'active' the truthful state.
  private async restoreSubject(subjectType: CleanupSubjectType, tenantId: string | null, _userId: string | null) {
    if (subjectType !== 'tenant' || !tenantId) {
      return
    }
    await this.dbAccessor
      .get()
      .update(tenants)
      .set({ status: 'active', updatedAt: new Date().toISOString() })
      .where(and(eq(tenants.id, tenantId), eq(tenants.status, 'suspended')))
  }

  private async deleteSubject(subjectType: CleanupSubjectType, id: string) {
    if (subjectType === 'tenant') {
      await this.dataManagement.deleteTenantAccountById(id)
      return
    }
    await this.accountDeletion.requestByAdmin(id)
  }

  private async finishItem(
    batchId: string,
    subjectId: string,
    status: string,
    reason: string | null,
    errorCode?: string,
  ) {
    await this.dbAccessor
      .get()
      .update(tenantCleanupItems)
      .set({ status, reason, errorCode: errorCode ?? null, completedAt: new Date().toISOString() })
      .where(
        and(
          eq(tenantCleanupItems.batchId, batchId),
          sql`coalesce(${tenantCleanupItems.tenantId}, ${tenantCleanupItems.userId}) = ${subjectId}`,
        ),
      )
  }

  private async recordAudit(
    input: ExecuteCleanupInput,
    batchId: string,
    subjectId: string,
    result: 'success' | 'skipped' | 'failed',
    after?: Record<string, unknown>,
    before?: CleanupCandidate,
    errorCode?: string,
  ) {
    await this.audit.record({
      action: `cleanup.${input.mode}`,
      targetType: input.subjectType,
      targetId: subjectId,
      batchId,
      result: result === 'success' ? undefined : result,
      errorCode,
      before: before ? { ...before } : undefined,
      after,
    })
  }
}
