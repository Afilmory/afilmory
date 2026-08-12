# Mobile Subscription Surface and Quota Paywall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Afilmory iOS app a subscription surface in Studio with live usage, warn at 80% of any quota, and turn every quota rejection into a localized explanation with an upgrade path.

**Architecture:** The backend gains structured quota errors (a `reason` plus numbers travelling on both the REST 402 body and the SSE `error` payload) and one `GET billing/overview` snapshot endpoint. The iOS client gains an `EntitlementStore` singleton feeding a Studio "Plan" section and a `SubscriptionView` with two independent offer sections, plus a shared `QuotaWallSheet` reached from three failure states. Copy is localized client-side from the structured numbers; the server's existing Chinese messages are left untouched for web and dashboard.

**Tech Stack:** NestJS-style Hono backend (`@tsuki-hono/core`, tsyringe DI, Drizzle, vitest) and a native Swift 6 / UIKit + SwiftUI iOS app (XcodeGen, XCTest, String Catalogs).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-12-mobile-subscription-paywall-design.md`. Read it before Task 1.
- **Zero comments by default.** Per root `CLAUDE.md`, write no comments and no JSDoc unless the line documents unexpected behavior or a hidden invariant a future reader would otherwise reverse. Delete any comment that merely restates the code.
- **Existing Chinese `message` values stay byte-for-byte.** Web and dashboard render them. Only add `details`; never reword or translate a message.
- **The 80% threshold lives server-side** in `billing-quota.policy.ts`. The client renders `nearingLimit` and never computes a ratio.
- **The client never blocks an operation on its local snapshot.** No upload/sync button is ever disabled on quota grounds.
- **iOS deployment target is 18.0, Swift 6, strict concurrency `targeted`.** Any post-18 API needs an availability guard and an iOS 18 fallback.
- **All new iOS copy goes in `apps/mobile/NativeApp/Resources/Localizable.xcstrings`** with translations for `ja`, `ko`, `zh-HK`, `zh-Hans`, `zh-Hant`. The English source text is the key. `xcodebuild` does not write back to the catalog — add entries by hand.
- **Adding or deleting a `.swift` file requires** `pnpm --filter @afilmory/mobile native:generate` before Xcode sees it, and the regenerated `Afilmory.xcodeproj` is committed.
- **React components / SwiftUI views stay under 300 lines**, files under 500.
- **No feature flags and no backwards-compat shims.** The app is unreleased; change code in place.
- Backend tests: `pnpm --filter core exec vitest run <path>`. iOS tests: `pnpm --filter @afilmory/mobile native:test`, or `xcodebuild test -project Afilmory.xcodeproj -scheme 'Afilmory Local' -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AfilmoryTests/<Suite>` from `apps/mobile`.
- Lint only what you changed: `pnpm exec eslint --fix <paths>`.

---

### Task 1: Structured quota errors

Six enforcement sites throw either a billing code with prose or a generic `COMMON_BAD_REQUEST`. This task gives all six one shared constructor that attaches a machine-readable `reason` and its numbers, and widens `BizException` to carry them.

**Files:**
- Modify: `be/apps/core/src/errors/biz-exception.ts`
- Create: `be/apps/core/src/modules/platform/billing/quota/billing-quota.error.ts`
- Create: `be/apps/core/src/modules/platform/billing/quota/billing-quota.error.spec.ts`
- Modify: `be/apps/core/src/modules/platform/billing/plan/billing-plan.service.ts:140,157`
- Modify: `be/apps/core/src/modules/content/photo/assets/photo-asset.service.ts:1436,1460,1812,1827`
- Modify: `be/apps/core/src/modules/infrastructure/data-sync/data-sync.service.ts:1436`

**Interfaces:**
- Consumes: nothing.
- Produces: `type QuotaReason = 'monthly_process' | 'custom_domain' | 'upload_size' | 'library_items' | 'storage' | 'sync_object_size'`; `quotaExceeded(input: { reason: QuotaReason, message: string, details: Record<string, number | null> }): BizException`; `BizException.details?: Record<string, unknown>` surfaced by `toResponse()`.

- [ ] **Step 1: Write the failing test**

Create `be/apps/core/src/modules/platform/billing/quota/billing-quota.error.spec.ts`:

```ts
import { ErrorCode } from '@core/errors'
import { describe, expect, it } from 'vitest'

import { quotaExceeded } from './billing-quota.error'

describe('quotaExceeded', () => {
  it('carries the reason and numbers on the response body', () => {
    const error = quotaExceeded({
      reason: 'storage',
      message: '托管存储空间不足',
      details: { capacityBytes: 5_368_709_120, usedBytes: 5_262_002_324, incomingBytes: 188_743_680 },
    })

    expect(error.getHttpStatus()).toBe(402)
    expect(error.toResponse()).toEqual({
      ok: false,
      code: ErrorCode.BILLING_STORAGE_QUOTA_EXCEEDED,
      message: '托管存储空间不足',
      details: {
        reason: 'storage',
        capacityBytes: 5_368_709_120,
        usedBytes: 5_262_002_324,
        incomingBytes: 188_743_680,
      },
    })
  })

  it('uses the plan quota code for every non-storage dimension', () => {
    const error = quotaExceeded({
      reason: 'upload_size',
      message: '文件超出允许的单张大小',
      details: { limitMb: 25, actualMb: 41 },
    })

    expect(error.code).toBe(ErrorCode.BILLING_PLAN_QUOTA_EXCEEDED)
    expect(error.toResponse().details).toEqual({ reason: 'upload_size', limitMb: 25, actualMb: 41 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter core exec vitest run src/modules/platform/billing/quota/billing-quota.error.spec.ts`
Expected: FAIL — `Cannot find module './billing-quota.error'`.

- [ ] **Step 3: Widen `BizException`**

In `be/apps/core/src/errors/biz-exception.ts`, add `details` to the options, the class, and the response:

```ts
export interface BizExceptionOptions {
  message?: string
  cause?: unknown
  details?: Record<string, unknown>
}

export interface BizErrorResponse {
  ok: boolean
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}
```

Inside the class add `readonly details?: Record<string, unknown>`, assign `this.details = options?.details` in the constructor, and return it from `toResponse()`:

```ts
  toResponse(): BizErrorResponse {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    }
  }
```

- [ ] **Step 4: Write the quota error constructor**

Create `be/apps/core/src/modules/platform/billing/quota/billing-quota.error.ts`:

```ts
import { BizException, ErrorCode } from '@core/errors'

export type QuotaReason
  = | 'custom_domain'
    | 'library_items'
    | 'monthly_process'
    | 'storage'
    | 'sync_object_size'
    | 'upload_size'

export function quotaExceeded(input: {
  reason: QuotaReason
  message: string
  details: Record<string, number | null>
}): BizException {
  const code = input.reason === 'storage'
    ? ErrorCode.BILLING_STORAGE_QUOTA_EXCEEDED
    : ErrorCode.BILLING_PLAN_QUOTA_EXCEEDED
  return new BizException(code, {
    message: input.message,
    details: { reason: input.reason, ...input.details },
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter core exec vitest run src/modules/platform/billing/quota/billing-quota.error.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Convert the six enforcement sites**

Each keeps its existing message string exactly. `billing-plan.service.ts:140`:

```ts
      throw quotaExceeded({
        reason: 'monthly_process',
        message: `当月新增照片额度不足，可用剩余：${remaining}，请求新增：${incomingItems}。升级订阅后即可提升限额。`,
        details: { limit: quota.monthlyAssetProcessLimit, used, requested: incomingItems },
      })
```

`billing-plan.service.ts:157` — keep the existing `message` variable:

```ts
    throw quotaExceeded({
      reason: 'custom_domain',
      message,
      details: { limit, current: currentDomainCount },
    })
```

`photo-asset.service.ts:1436`:

```ts
      throw quotaExceeded({
        reason: 'upload_size',
        message: `文件 ${input.filename} (${actualSize} MB) 超出允许的单张大小 ${displayLimit} MB`,
        details: { limitMb: limitMb ?? maxBytes / 1024 / 1024, actualMb: size / 1024 / 1024 },
      })
```

`photo-asset.service.ts:1460`:

```ts
      throw quotaExceeded({
        reason: 'library_items',
        message: `当前图库已有 ${current} 张图片，超过上限 ${limit}，无法继续上传`,
        details: { limit, current },
      })
```

`photo-asset.service.ts:1812` and `:1827` — both keep their template literals verbatim and add:

```ts
        details: { capacityBytes: capacity, usedBytes: usage.totalBytes, incomingBytes: params.incomingBytes },
```

with `reason: 'storage'`. The `:1812` site is the already-over-limit branch, `:1827` the projected-over branch; both carry the same three numbers.

`data-sync.service.ts:1436`:

```ts
    throw quotaExceeded({
      reason: 'sync_object_size',
      message: `存储对象 ${storageObject.key} (${actualSize} MB) 超出允许的同步大小 ${readableLimit} MB`,
      details: { limitMb: maxBytes / 1024 / 1024, actualMb: size / 1024 / 1024 },
    })
```

Import `quotaExceeded` from `@core/modules/platform/billing/quota/billing-quota.error` in each file, and drop any now-unused `ErrorCode` import only if nothing else in the file uses it.

- [ ] **Step 7: Run the affected suites**

Run: `pnpm --filter core exec vitest run src/modules/platform/billing`
Expected: PASS. `billing-plan.service.spec.ts` asserts `code: ErrorCode.BILLING_PLAN_QUOTA_EXCEEDED` on the custom-domain path, which still holds.

- [ ] **Step 8: Build and lint**

Run: `pnpm --filter core build` then `pnpm exec eslint --fix be/apps/core/src/errors/biz-exception.ts be/apps/core/src/modules/platform/billing/quota/*.ts be/apps/core/src/modules/platform/billing/plan/billing-plan.service.ts be/apps/core/src/modules/content/photo/assets/photo-asset.service.ts be/apps/core/src/modules/infrastructure/data-sync/data-sync.service.ts`
Expected: build succeeds, lint clean.

- [ ] **Step 9: Commit**

```bash
git add be/apps/core/src/errors be/apps/core/src/modules/platform/billing/quota be/apps/core/src/modules/platform/billing/plan/billing-plan.service.ts be/apps/core/src/modules/content/photo/assets/photo-asset.service.ts be/apps/core/src/modules/infrastructure/data-sync/data-sync.service.ts
git commit -m "feat(be): give quota rejections a machine-readable reason"
```

---

### Task 2: Quota threshold policy

**Files:**
- Create: `be/apps/core/src/modules/platform/billing/quota/billing-quota.policy.ts`
- Create: `be/apps/core/src/modules/platform/billing/quota/billing-quota.policy.spec.ts`

**Interfaces:**
- Consumes: `QuotaReason` from Task 1.
- Produces: `interface QuotaDimension { reason: QuotaReason, used: number, limit: number | null, unit: 'bytes' | 'count' | 'megabytes', nearingLimit: boolean }`; `summarizeQuotas(input: QuotaUsageInput): QuotaDimension[]`; `QUOTA_WARNING_RATIO`.

- [ ] **Step 1: Write the failing test**

Create `billing-quota.policy.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { summarizeQuotas } from './billing-quota.policy'

const base = {
  customDomains: { limit: null, used: 0 },
  libraryItems: { limit: null, used: 0 },
  monthlyProcess: { limit: null, used: 0 },
  storage: { limit: null, used: 0 },
}

describe('summarizeQuotas', () => {
  it('warns from 80% and not before', () => {
    const under = summarizeQuotas({ ...base, storage: { limit: 100, used: 79 } })
    const at = summarizeQuotas({ ...base, storage: { limit: 100, used: 80 } })

    expect(under.find(d => d.reason === 'storage')?.nearingLimit).toBe(false)
    expect(at.find(d => d.reason === 'storage')?.nearingLimit).toBe(true)
  })

  it('still warns once a dimension is over its limit', () => {
    const over = summarizeQuotas({ ...base, monthlyProcess: { limit: 1000, used: 1200 } })
    expect(over.find(d => d.reason === 'monthly_process')?.nearingLimit).toBe(true)
  })

  it('never warns on an unlimited dimension', () => {
    const unlimited = summarizeQuotas({ ...base, libraryItems: { limit: null, used: 9_999_999 } })
    expect(unlimited.find(d => d.reason === 'library_items')?.nearingLimit).toBe(false)
  })

  it('never warns at zero usage', () => {
    const empty = summarizeQuotas({ ...base, storage: { limit: 0, used: 0 } })
    expect(empty.find(d => d.reason === 'storage')?.nearingLimit).toBe(false)
  })

  it('reports the unit each dimension is measured in', () => {
    const dimensions = summarizeQuotas({ ...base, storage: { limit: 100, used: 10 } })
    expect(dimensions.find(d => d.reason === 'storage')?.unit).toBe('bytes')
    expect(dimensions.find(d => d.reason === 'monthly_process')?.unit).toBe('count')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter core exec vitest run src/modules/platform/billing/quota/billing-quota.policy.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the policy**

```ts
import type { QuotaReason } from './billing-quota.error'

export const QUOTA_WARNING_RATIO = 0.8

export type QuotaUnit = 'bytes' | 'count' | 'megabytes'

export interface QuotaDimension {
  reason: QuotaReason
  used: number
  limit: number | null
  unit: QuotaUnit
  nearingLimit: boolean
}

interface QuotaMeasure {
  limit: number | null
  used: number
}

export interface QuotaUsageInput {
  customDomains: QuotaMeasure
  libraryItems: QuotaMeasure
  monthlyProcess: QuotaMeasure
  storage: QuotaMeasure
}

function toDimension(reason: QuotaReason, unit: QuotaUnit, measure: QuotaMeasure): QuotaDimension {
  const nearingLimit
    = measure.limit !== null && measure.limit > 0 && measure.used / measure.limit >= QUOTA_WARNING_RATIO
  return { reason, used: measure.used, limit: measure.limit, unit, nearingLimit }
}

export function summarizeQuotas(input: QuotaUsageInput): QuotaDimension[] {
  return [
    toDimension('storage', 'bytes', input.storage),
    toDimension('monthly_process', 'count', input.monthlyProcess),
    toDimension('library_items', 'count', input.libraryItems),
    toDimension('custom_domain', 'count', input.customDomains),
  ]
}
```

`upload_size` and `sync_object_size` are per-file ceilings, not consumable allowances — they have no "used" value and are deliberately absent from the summary. They exist only as wall reasons.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter core exec vitest run src/modules/platform/billing/quota/billing-quota.policy.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add be/apps/core/src/modules/platform/billing/quota
git commit -m "feat(be): compute quota warning thresholds server-side"
```

---

### Task 3: SSE error events carry the structure

Upload and data sync stream over SSE, so their quota rejections arrive as `{ type: 'error', payload: { message } }` with HTTP 200. Without this task the client cannot tell a quota wall from any other failure on the two paths that matter most.

**Files:**
- Modify: `be/apps/core/src/modules/content/photo/assets/photo.controller.ts:89-93`
- Modify: `be/apps/core/src/modules/infrastructure/data-sync/data-sync.controller.ts:48-50`
- Create: `be/apps/core/src/modules/shared/http/sse-error.ts`
- Create: `be/apps/core/src/modules/shared/http/sse-error.spec.ts`

**Interfaces:**
- Consumes: `BizException` from Task 1.
- Produces: `describeStreamError(error: unknown): { message: string, code?: number, details?: Record<string, unknown> }`.

- [ ] **Step 1: Write the failing test**

Create `be/apps/core/src/modules/shared/http/sse-error.spec.ts`:

```ts
import { BizException, ErrorCode } from '@core/errors'
import { describe, expect, it } from 'vitest'

import { describeStreamError } from './sse-error'

describe('describeStreamError', () => {
  it('forwards the code and details of a business exception', () => {
    const error = new BizException(ErrorCode.BILLING_STORAGE_QUOTA_EXCEEDED, {
      message: '托管存储空间不足',
      details: { reason: 'storage', capacityBytes: 100 },
    })

    expect(describeStreamError(error)).toEqual({
      message: '托管存储空间不足',
      code: ErrorCode.BILLING_STORAGE_QUOTA_EXCEEDED,
      details: { reason: 'storage', capacityBytes: 100 },
    })
  })

  it('reduces an unknown failure to its message', () => {
    expect(describeStreamError(new Error('boom'))).toEqual({ message: 'boom' })
    expect(describeStreamError('nope')).toEqual({ message: '上传失败' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter core exec vitest run src/modules/shared/http/sse-error.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

Create `be/apps/core/src/modules/shared/http/sse-error.ts`:

```ts
import { BizException } from '@core/errors'

export function describeStreamError(error: unknown): {
  message: string
  code?: number
  details?: Record<string, unknown>
} {
  if (error instanceof BizException) {
    return {
      message: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    }
  }
  return { message: error instanceof Error ? error.message : '上传失败' }
}
```

- [ ] **Step 4: Use it in both controllers**

`photo.controller.ts`, replacing lines 89-93:

```ts
        } catch (error) {
          this.logger.error(error)
          await sendEvent({ type: 'error', payload: describeStreamError(error) })
        }
```

`data-sync.controller.ts` line 50 takes the identical replacement. Both import `describeStreamError` from `@core/modules/shared/http/sse-error`. Remove the now-dead local `const message = ...` line in each.

- [ ] **Step 5: Run tests and build**

Run: `pnpm --filter core exec vitest run src/modules/shared/http/sse-error.spec.ts && pnpm --filter core build`
Expected: 2 tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add be/apps/core/src/modules/shared/http be/apps/core/src/modules/content/photo/assets/photo.controller.ts be/apps/core/src/modules/infrastructure/data-sync/data-sync.controller.ts
git commit -m "feat(be): forward the error code and details over progress streams"
```

---

### Task 4: `GET billing/overview`

**Files:**
- Create: `be/apps/core/src/modules/platform/billing/overview/billing-overview.service.ts`
- Create: `be/apps/core/src/modules/platform/billing/overview/billing-overview.types.ts`
- Create: `be/apps/core/src/modules/platform/billing/overview/billing-overview.service.spec.ts`
- Modify: `be/apps/core/src/modules/platform/billing/billing.controller.ts`
- Modify: `be/apps/core/src/modules/platform/billing/billing.module.ts`

**Interfaces:**
- Consumes: `summarizeQuotas`, `QuotaDimension` from Task 2.
- Produces: `GET /api/billing/overview` returning `BillingOverview`:

```ts
interface BillingOverview {
  applicationPlan: { id: string, name: string }
  storagePlan: { id: string, name: string, capacityBytes: number | null } | null
  managedStorageEnabled: boolean
  subscriptionProvider: 'app_store' | 'creem' | 'manual' | null
  dimensions: QuotaDimension[]
}
```

- [ ] **Step 1: Write the failing test**

Create `billing-overview.service.spec.ts`. It exercises the two branches that matter; everything else is straight composition:

```ts
import { describe, expect, it, vi } from 'vitest'

import { BillingOverviewService } from './billing-overview.service'

function createService(overrides: {
  managedProviderKey?: string | null
  storagePlan?: { id: string, name: string, capacityBytes: number | null } | null
  provider?: string | null
}) {
  const billingPlanService = {
    getCurrentPlanSummary: vi.fn().mockResolvedValue({ planId: 'free', name: 'Free' }),
    getQuotaForTenant: vi.fn().mockResolvedValue({
      customDomainLimit: 0,
      libraryItemLimit: 5000,
      maxSyncObjectSizeMb: 100,
      maxUploadSizeMb: 25,
      monthlyAssetProcessLimit: 1000,
    }),
  }
  const storagePlanService = {
    getPlanSummaryForTenant: vi.fn().mockResolvedValue(overrides.storagePlan ?? null),
    getQuotaForTenant: vi.fn().mockResolvedValue({ totalBytes: overrides.storagePlan?.capacityBytes ?? null }),
  }
  const managedStorageService = {
    getUsageTotals: vi.fn().mockResolvedValue({ fileCount: 12, totalBytes: 4_100_000_000 }),
  }
  const systemSettingService = {
    getManagedStorageProviderKey: vi.fn().mockResolvedValue(overrides.managedProviderKey ?? null),
  }
  const usageService = { getUsageTotal: vi.fn().mockResolvedValue(640) }
  const subscriptions = { getActiveProvider: vi.fn().mockResolvedValue(overrides.provider ?? null) }

  return new BillingOverviewService(
    billingPlanService as never,
    storagePlanService as never,
    managedStorageService as never,
    systemSettingService as never,
    usageService as never,
    subscriptions as never,
  )
}

describe('billingOverviewService', () => {
  it('reports no storage dimension when the workspace brings its own storage', async () => {
    const overview = await createService({ managedProviderKey: null }).getOverview('tenant-1')

    expect(overview.managedStorageEnabled).toBe(false)
    expect(overview.storagePlan).toBeNull()
    expect(overview.dimensions.find(d => d.reason === 'storage')).toBeUndefined()
  })

  it('passes the active provider through so the client can hide App Store purchase', async () => {
    const overview = await createService({
      managedProviderKey: 's3',
      storagePlan: { id: 'managed-5gb', name: '5 GB', capacityBytes: 5_368_709_120 },
      provider: 'creem',
    }).getOverview('tenant-1')

    expect(overview.subscriptionProvider).toBe('creem')
    expect(overview.dimensions.find(d => d.reason === 'storage')?.used).toBe(4_100_000_000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter core exec vitest run src/modules/platform/billing/overview/billing-overview.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the types**

Create `billing-overview.types.ts`:

```ts
import type { QuotaDimension } from '../quota/billing-quota.policy'

export interface BillingOverview {
  applicationPlan: { id: string, name: string }
  storagePlan: { id: string, name: string, capacityBytes: number | null } | null
  managedStorageEnabled: boolean
  subscriptionProvider: 'app_store' | 'creem' | 'manual' | null
  dimensions: QuotaDimension[]
}
```

- [ ] **Step 4: Write the service**

Create `billing-overview.service.ts`. It reads the managed provider key first, because a null key means the storage dimension must be omitted entirely rather than reported as zero:

```ts
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { ManagedStorageService } from '@core/modules/platform/managed-storage/managed-storage.service'
import { injectable } from 'tsyringe'

import { BillingPlanService } from '../plan/billing-plan.service'
import { StoragePlanService } from '../plan/storage-plan.service'
import { summarizeQuotas } from '../quota/billing-quota.policy'
import { BillingSubscriptionQueryService } from '../subscription/billing-subscription-query.service'
import { BILLING_USAGE_EVENT } from '../usage/billing-usage.constants'
import { BillingUsageService } from '../usage/billing-usage.service'
import type { BillingOverview } from './billing-overview.types'

@injectable()
export class BillingOverviewService {
  constructor(
    private readonly plans: BillingPlanService,
    private readonly storagePlans: StoragePlanService,
    private readonly managedStorage: ManagedStorageService,
    private readonly systemSettings: SystemSettingService,
    private readonly usage: BillingUsageService,
    private readonly subscriptions: BillingSubscriptionQueryService,
  ) {}

  async getOverview(tenantId: string): Promise<BillingOverview> {
    const providerKey = await this.systemSettings.getManagedStorageProviderKey()
    const [plan, quota, storagePlan, storageQuota, monthlyUsed, libraryItems, provider] = await Promise.all([
      this.plans.getCurrentPlanSummary(),
      this.plans.getQuotaForTenant(tenantId),
      this.storagePlans.getPlanSummaryForTenant(tenantId),
      this.storagePlans.getQuotaForTenant(tenantId),
      this.usage.getUsageTotal(tenantId, BILLING_USAGE_EVENT.PHOTO_ASSET_CREATED, { since: startOfUtcMonth() }),
      this.plans.countLibraryItems(tenantId),
      this.subscriptions.getActiveProvider(tenantId),
    ])

    const storageUsage = providerKey
      ? await this.managedStorage.getUsageTotals(providerKey, tenantId)
      : null

    const dimensions = summarizeQuotas({
      customDomains: { limit: quota.customDomainLimit, used: await this.plans.countCustomDomains(tenantId) },
      libraryItems: { limit: quota.libraryItemLimit, used: libraryItems },
      monthlyProcess: { limit: quota.monthlyAssetProcessLimit, used: monthlyUsed },
      storage: { limit: storageQuota.totalBytes, used: storageUsage?.totalBytes ?? 0 },
    }).filter(dimension => dimension.reason !== 'storage' || storageUsage !== null)

    return {
      applicationPlan: { id: plan.planId, name: plan.name },
      storagePlan: storageUsage === null ? null : storagePlan,
      managedStorageEnabled: storageUsage !== null,
      subscriptionProvider: provider,
      dimensions,
    }
  }
}
```

Two helpers this service needs do not exist yet. Add them where their data lives rather than reaching into another module's tables:

- `BillingPlanService.countLibraryItems(tenantId: string): Promise<number>` — the same `count(*)` over `photoAssets` that `PhotoAssetService.countTenantPhotos` runs.
- `BillingPlanService.countCustomDomains(tenantId: string): Promise<number>` — `count(*)` over `tenantDomains` for the tenant.
- `BillingSubscriptionQueryService.getActiveProvider(tenantId)` — create `be/apps/core/src/modules/platform/billing/subscription/billing-subscription-query.service.ts` selecting `provider` from `billingSubscriptions` where `tenantId` matches and `status` is one of `active`, `cancel_scheduled`, `grace_period`, ordered by `providerUpdatedAt` descending, limit 1, returning `null` when empty.

Import `startOfUtcMonth` from the same module `billing-plan.service.ts` uses.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter core exec vitest run src/modules/platform/billing/overview/billing-overview.service.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Expose the route**

In `billing.controller.ts` add the dependency and the handler; the class already carries `@TenantRoles('owner')`:

```ts
  @Get('overview')
  async getOverview(): Promise<BillingOverview> {
    return await this.billingOverviewService.getOverview(requireTenantContext().tenant.id)
  }
```

Register `BillingOverviewService` and `BillingSubscriptionQueryService` in `billing.module.ts` `providers`, and add `ManagedStorageModule` to its `imports` if `ManagedStorageService` is not already reachable.

- [ ] **Step 7: Verify the whole backend still builds and passes**

Run: `pnpm --filter core build && pnpm --filter core exec vitest run`
Expected: build succeeds; all suites pass.

- [ ] **Step 8: Commit**

```bash
git add be/apps/core/src/modules/platform/billing
git commit -m "feat(be): serve one billing overview snapshot for the mobile client"
```

---

### Task 5: `QuotaWallReason` on the client

The wall arrives over two transports: a REST 402 JSON body and an SSE `error` payload. This task parses both into one value and produces localized copy.

**Files:**
- Create: `apps/mobile/NativeApp/Billing/QuotaWallReason.swift`
- Create: `apps/mobile/modules/photo-masonry/ios/Tests/QuotaWallReasonTests.swift`
- Modify: `apps/mobile/NativeApp/Resources/Localizable.xcstrings`

**Interfaces:**
- Consumes: the `details` shape from Task 1 and the SSE payload from Task 3.
- Produces: `enum QuotaWallReason { case storage(usedBytes: Int64, incomingBytes: Int64, capacityBytes: Int64), monthlyProcess(used: Int, limit: Int, requested: Int), libraryItems(current: Int, limit: Int), uploadSize(actualMb: Double, limitMb: Double), syncObjectSize(actualMb: Double, limitMb: Double), customDomain(current: Int, limit: Int), unknown }`; `static func parse(details: [String: Any]?) -> QuotaWallReason?`; `static func parse(apiError: APIError) -> QuotaWallReason?`; `var title: String`; `var explanation: String`; `var secondaryActionTitle: String`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/modules/photo-masonry/ios/Tests/QuotaWallReasonTests.swift`:

```swift
import XCTest

@testable import Afilmory

final class QuotaWallReasonTests: XCTestCase {
  func testParsesAStorageRejectionFromARestResponse() {
    let body = """
    {"ok":false,"code":41,"message":"...","details":{"reason":"storage","usedBytes":5262002324,"incomingBytes":188743680,"capacityBytes":5368709120}}
    """
    let reason = QuotaWallReason.parse(apiError: APIError.http(status: 402, body: body))

    guard case .storage(let used, let incoming, let capacity)? = reason else {
      return XCTFail("Expected a storage reason.")
    }
    XCTAssertEqual(used, 5_262_002_324)
    XCTAssertEqual(incoming, 188_743_680)
    XCTAssertEqual(capacity, 5_368_709_120)
  }

  func testParsesAMonthlyRejectionFromAnEventPayload() {
    let reason = QuotaWallReason.parse(details: [
      "reason": "monthly_process",
      "used": 980,
      "limit": 1000,
      "requested": 40,
    ])

    guard case .monthlyProcess(let used, let limit, let requested)? = reason else {
      return XCTFail("Expected a monthly process reason.")
    }
    XCTAssertEqual(used, 980)
    XCTAssertEqual(limit, 1000)
    XCTAssertEqual(requested, 40)
  }

  func testAnUnrecognizedReasonStillProducesAWall() {
    let reason = QuotaWallReason.parse(details: ["reason": "quantum_flux", "limit": 3])

    guard case .unknown? = reason else {
      return XCTFail("A future server dimension must degrade, not vanish.")
    }
    XCTAssertFalse(reason!.explanation.isEmpty)
  }

  func testANonQuotaFailureIsNotAWall() {
    XCTAssertNil(QuotaWallReason.parse(details: nil))
    XCTAssertNil(QuotaWallReason.parse(details: ["message": "boom"]))
    XCTAssertNil(QuotaWallReason.parse(apiError: APIError.http(status: 500, body: "<html>502</html>")))
    XCTAssertNil(QuotaWallReason.parse(apiError: APIError.unauthorized))
  }

  func testEveryReasonHasTitleAndExplanation() {
    let reasons: [QuotaWallReason] = [
      .storage(usedBytes: 1, incomingBytes: 1, capacityBytes: 2),
      .monthlyProcess(used: 1, limit: 2, requested: 1),
      .libraryItems(current: 1, limit: 2),
      .uploadSize(actualMb: 41, limitMb: 25),
      .syncObjectSize(actualMb: 200, limitMb: 100),
      .customDomain(current: 0, limit: 0),
      .unknown,
    ]
    for reason in reasons {
      XCTAssertFalse(reason.title.isEmpty)
      XCTAssertFalse(reason.explanation.isEmpty)
    }
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

From `apps/mobile`, run `pnpm native:generate` (the test file is new), then:
`xcodebuild test -project Afilmory.xcodeproj -scheme 'Afilmory Local' -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AfilmoryTests/QuotaWallReasonTests`
Expected: FAIL — `cannot find 'QuotaWallReason' in scope`.

- [ ] **Step 3: Write the type**

Create `apps/mobile/NativeApp/Billing/QuotaWallReason.swift`:

```swift
import Foundation

enum QuotaWallReason: Equatable {
  case customDomain(current: Int, limit: Int)
  case libraryItems(current: Int, limit: Int)
  case monthlyProcess(used: Int, limit: Int, requested: Int)
  case storage(usedBytes: Int64, incomingBytes: Int64, capacityBytes: Int64)
  case syncObjectSize(actualMb: Double, limitMb: Double)
  case unknown
  case uploadSize(actualMb: Double, limitMb: Double)

  static func parse(details: [String: Any]?) -> QuotaWallReason? {
    guard let details, let reason = details["reason"] as? String else { return nil }
    func int(_ key: String) -> Int { (details[key] as? NSNumber)?.intValue ?? 0 }
    func int64(_ key: String) -> Int64 { (details[key] as? NSNumber)?.int64Value ?? 0 }
    func double(_ key: String) -> Double { (details[key] as? NSNumber)?.doubleValue ?? 0 }

    switch reason {
    case "custom_domain": return .customDomain(current: int("current"), limit: int("limit"))
    case "library_items": return .libraryItems(current: int("current"), limit: int("limit"))
    case "monthly_process":
      return .monthlyProcess(used: int("used"), limit: int("limit"), requested: int("requested"))
    case "storage":
      return .storage(
        usedBytes: int64("usedBytes"),
        incomingBytes: int64("incomingBytes"),
        capacityBytes: int64("capacityBytes")
      )
    case "sync_object_size": return .syncObjectSize(actualMb: double("actualMb"), limitMb: double("limitMb"))
    case "upload_size": return .uploadSize(actualMb: double("actualMb"), limitMb: double("limitMb"))
    default: return .unknown
    }
  }

  static func parse(apiError: APIError) -> QuotaWallReason? {
    guard case .http(_, let body) = apiError,
          let payload = body?.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any]
    else { return nil }
    return parse(details: object["details"] as? [String: Any])
  }
}
```

- [ ] **Step 4: Add the copy**

Extend the same file with the presentation, using a byte formatter for storage so 5 GB reads as 5 GB:

```swift
extension QuotaWallReason {
  var title: String {
    switch self {
    case .customDomain: String(localized: "Custom domains are not included")
    case .libraryItems: String(localized: "Library is full")
    case .monthlyProcess: String(localized: "Monthly photo limit reached")
    case .storage: String(localized: "Storage is full")
    case .syncObjectSize, .uploadSize: String(localized: "File is too large")
    case .unknown: String(localized: "Plan limit reached")
    }
  }

  var explanation: String {
    switch self {
    case .customDomain:
      String(localized: "Your plan does not include a custom domain.")
    case .libraryItems(let current, let limit):
      String(localized: "Your library holds \(current) of \(limit) photos.")
    case .monthlyProcess(let used, let limit, let requested):
      String(localized: "You have processed \(used) of \(limit) photos this month, and \(requested) more are queued.")
    case .storage(let used, let incoming, let capacity):
      String(localized: "Uploading needs \(Self.bytes(used + incoming - capacity)) more than your plan allows.")
    case .syncObjectSize(let actual, let limit), .uploadSize(let actual, let limit):
      String(localized: "This file is \(Self.megabytes(actual)), over the \(Self.megabytes(limit)) limit.")
    case .unknown:
      String(localized: "This workspace has reached a limit of its current plan.")
    }
  }

  var secondaryActionTitle: String {
    switch self {
    case .libraryItems, .storage: String(localized: "Free up space instead")
    case .customDomain: String(localized: "Remove an existing domain")
    case .monthlyProcess: String(localized: "Wait for next month's reset")
    case .syncObjectSize, .uploadSize, .unknown: String(localized: "Not now")
    }
  }

  private static func bytes(_ value: Int64) -> String {
    ByteCountFormatter.string(fromByteCount: max(0, value), countStyle: .file)
  }

  private static func megabytes(_ value: Double) -> String {
    String(format: "%.0f MB", value.rounded())
  }
}
```

- [ ] **Step 5: Add every new string to the catalog**

Add all twelve English keys above to `apps/mobile/NativeApp/Resources/Localizable.xcstrings` with `ja`, `ko`, `zh-HK`, `zh-Hans`, `zh-Hant` translations. Interpolated keys become format strings — `"Your library holds %lld of %lld photos."` and `"This file is %@, over the %@ limit."` — and must be added under those exact keys. Follow the existing file shape: `strings` sorted by key, each with a `localizations` object of `{"stringUnit": {"state": "translated", "value": "…"}}`.

- [ ] **Step 6: Run test to verify it passes**

Run: `xcodebuild test -project Afilmory.xcodeproj -scheme 'Afilmory Local' -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AfilmoryTests/QuotaWallReasonTests`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/NativeApp/Billing/QuotaWallReason.swift apps/mobile/modules/photo-masonry/ios/Tests/QuotaWallReasonTests.swift apps/mobile/NativeApp/Resources/Localizable.xcstrings apps/mobile/Afilmory.xcodeproj
git commit -m "feat(mobile): read quota rejections off both transports"
```

---

### Task 6: `EntitlementStore`

**Files:**
- Create: `apps/mobile/NativeApp/Billing/BillingOverviewAPI.swift`
- Create: `apps/mobile/NativeApp/Billing/EntitlementStore.swift`
- Create: `apps/mobile/modules/photo-masonry/ios/Tests/EntitlementStoreTests.swift`

**Interfaces:**
- Consumes: `GET billing/overview` from Task 4.
- Produces: `struct BillingOverview: Decodable, Sendable` mirroring Task 4's shape with `QuotaDimension { reason: String, used: Double, limit: Double?, unit: String, nearingLimit: Bool }`; `protocol BillingOverviewLoading { func load() async throws -> BillingOverview }`; `@MainActor final class EntitlementStore: ObservableObject` exposing `snapshot: BillingOverview?`, `isAvailable: Bool`, `func refresh() async`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/modules/photo-masonry/ios/Tests/EntitlementStoreTests.swift`:

```swift
import XCTest

@testable import Afilmory

private final class StubLoader: BillingOverviewLoading, @unchecked Sendable {
  var results: [Result<BillingOverview, Error>] = []
  private(set) var callCount = 0

  func load() async throws -> BillingOverview {
    callCount += 1
    guard !results.isEmpty else { throw APIError.cancelled }
    return try results.removeFirst().get()
  }
}

private func makeOverview(storageUsed: Double) -> BillingOverview {
  BillingOverview(
    applicationPlan: .init(id: "free", name: "Free"),
    storagePlan: nil,
    managedStorageEnabled: true,
    subscriptionProvider: nil,
    dimensions: [
      .init(reason: "storage", used: storageUsed, limit: 100, unit: "bytes", nearingLimit: storageUsed >= 80),
    ]
  )
}

@MainActor
final class EntitlementStoreTests: XCTestCase {
  func testStopsRefreshingAfterTheServerSaysTheCallerIsNotTheOwner() async {
    let loader = StubLoader()
    loader.results = [.failure(APIError.http(status: 403, body: nil))]
    let store = EntitlementStore(loader: loader)

    await store.refresh()
    await store.refresh()

    XCTAssertFalse(store.isAvailable)
    XCTAssertEqual(loader.callCount, 1)
  }

  func testKeepsTheLastSnapshotWhenARefreshFails() async {
    let loader = StubLoader()
    loader.results = [.success(makeOverview(storageUsed: 82)), .failure(APIError.http(status: 500, body: nil))]
    let store = EntitlementStore(loader: loader)

    await store.refresh()
    await store.refresh()

    XCTAssertEqual(store.snapshot?.dimensions.first?.used, 82)
    XCTAssertTrue(store.isAvailable)
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run `pnpm native:generate` from `apps/mobile`, then the same `xcodebuild test` command with `-only-testing:AfilmoryTests/EntitlementStoreTests`.
Expected: FAIL — `cannot find 'EntitlementStore' in scope`.

- [ ] **Step 3: Write the API and models**

Create `apps/mobile/NativeApp/Billing/BillingOverviewAPI.swift`:

```swift
import Foundation

struct BillingOverview: Decodable, Sendable, Equatable {
  struct PlanRef: Decodable, Sendable, Equatable {
    let id: String
    let name: String
  }

  struct StoragePlanRef: Decodable, Sendable, Equatable {
    let capacityBytes: Double?
    let id: String
    let name: String
  }

  struct QuotaDimension: Decodable, Sendable, Equatable {
    let limit: Double?
    let nearingLimit: Bool
    let reason: String
    let unit: String
    let used: Double
  }

  let applicationPlan: PlanRef
  let storagePlan: StoragePlanRef?
  let managedStorageEnabled: Bool
  let subscriptionProvider: String?
  let dimensions: [QuotaDimension]
}

protocol BillingOverviewLoading: Sendable {
  func load() async throws -> BillingOverview
}

struct LiveBillingOverviewLoader: BillingOverviewLoading {
  func load() async throws -> BillingOverview {
    try await AfilmoryAPI.shared.request(APIEndpoint(baseURL: .tenant, path: "billing/overview"))
  }
}
```

Give the test file's `BillingOverview` initializers memberwise access by declaring the structs without `private` members — the synthesized memberwise initializer is internal, which is what the test uses.

- [ ] **Step 4: Write the store**

Create `apps/mobile/NativeApp/Billing/EntitlementStore.swift`:

```swift
import Combine
import Foundation

@MainActor
final class EntitlementStore: ObservableObject {
  static let shared = EntitlementStore()

  @Published private(set) var snapshot: BillingOverview?
  @Published private(set) var isAvailable = true

  private let loader: BillingOverviewLoading
  private var refreshing = false

  init(loader: BillingOverviewLoading = LiveBillingOverviewLoader()) {
    self.loader = loader
  }

  var warnings: [BillingOverview.QuotaDimension] {
    snapshot?.dimensions.filter(\.nearingLimit) ?? []
  }

  func refresh() async {
    guard isAvailable, !refreshing else { return }
    refreshing = true
    defer { refreshing = false }
    do {
      snapshot = try await loader.load()
    } catch {
      // A 403 means this member is not the billing owner. That never becomes true by retrying,
      // and every retry is a request the workspace cannot use.
      if case .http(403, _)? = error as? APIError {
        isAvailable = false
        snapshot = nil
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run the `-only-testing:AfilmoryTests/EntitlementStoreTests` command.
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/NativeApp/Billing apps/mobile/modules/photo-masonry/ios/Tests/EntitlementStoreTests.swift apps/mobile/Afilmory.xcodeproj
git commit -m "feat(mobile): cache the workspace entitlement snapshot"
```

---

### Task 7: `SubscriptionView` with two offer sections

**Files:**
- Create: `apps/mobile/NativeApp/Billing/SubscriptionView.swift`
- Create: `apps/mobile/NativeApp/Billing/OfferSectionView.swift`
- Delete: `apps/mobile/NativeApp/Billing/SubscriptionSectionView.swift`
- Modify: `apps/mobile/NativeApp/Billing/SubscriptionStore.swift`
- Modify: `apps/mobile/NativeApp/Authentication/AccountSettingsView.swift`
- Modify: `apps/mobile/NativeApp/Resources/Localizable.xcstrings`

**Interfaces:**
- Consumes: `EntitlementStore` (Task 6), existing `SubscriptionStore`, `BillingOffer`.
- Produces: `struct SubscriptionView: View`, initialized with `init(focus: QuotaWallReason?)` so a wall can scroll to the right section; `SubscriptionStore.offers(for family: OfferFamily)` where `enum OfferFamily { case plan, storage }`.

- [ ] **Step 1: Write the failing test**

The split that matters is which offers belong to which section, and that is pure. Add to `apps/mobile/modules/photo-masonry/ios/Tests/EntitlementStoreTests.swift` a new suite:

```swift
final class OfferFamilyTests: XCTestCase {
  private func offer(_ id: String, plan: String?, storage: String?) -> BillingOffer {
    BillingOffer(
      applicationPlanId: plan,
      description: nil,
      externalProductId: "product.\(id)",
      id: id,
      name: id,
      rank: 0,
      storageCapacityBytes: nil,
      storagePlanId: storage
    )
  }

  func testSplitsOffersByWhatTheyGrant() {
    let offers = [
      offer("plan:pro", plan: "pro", storage: nil),
      offer("storage:50", plan: nil, storage: "managed-50gb"),
    ]

    XCTAssertEqual(OfferFamily.plan.filter(offers).map(\.id), ["plan:pro"])
    XCTAssertEqual(OfferFamily.storage.filter(offers).map(\.id), ["storage:50"])
  }

  func testAnOfferGrantingBothAppearsInBothSections() {
    let bundle = [offer("bundle", plan: "pro", storage: "managed-50gb")]

    XCTAssertEqual(OfferFamily.plan.filter(bundle).count, 1)
    XCTAssertEqual(OfferFamily.storage.filter(bundle).count, 1)
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `-only-testing:AfilmoryTests/OfferFamilyTests`
Expected: FAIL — `cannot find 'OfferFamily' in scope`.

- [ ] **Step 3: Implement the family split**

In `SubscriptionStore.swift`:

```swift
enum OfferFamily {
  case plan
  case storage

  func filter(_ offers: [BillingOffer]) -> [BillingOffer] {
    switch self {
    case .plan: offers.filter { $0.applicationPlanId != nil }
    case .storage: offers.filter { $0.storagePlanId != nil }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `-only-testing:AfilmoryTests/OfferFamilyTests`
Expected: PASS, 2 tests.

- [ ] **Step 5: Build the two views**

Create `OfferSectionView.swift`:

```swift
import SwiftUI

struct OfferSectionView: View {
  let title: String
  let dimension: BillingOverview.QuotaDimension?
  let offers: [SubscriptionStore.PurchasableOffer]
  let currentName: String?
  let purchasable: Bool
  let onPurchase: (BillingOffer) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.system(size: 12.5))
        .textCase(.uppercase)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 16)

      VStack(spacing: 0) {
        if let dimension {
          usageRow(dimension)
          Divider().padding(.leading, 16)
        }
        ForEach(Array(offers.enumerated()), id: \.element.id) { index, purchasableOffer in
          if index > 0 { Divider().padding(.leading, 16) }
          offerRow(purchasableOffer)
        }
      }
      .background(Color(uiColor: .secondarySystemGroupedBackground))
      .clipShape(.rect(cornerRadius: 12, style: .continuous))
    }
  }

  private func usageRow(_ dimension: BillingOverview.QuotaDimension) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(QuotaFormatter.headline(for: dimension))
        .font(.system(size: 15))
      Text(QuotaFormatter.detail(for: dimension))
        .font(.system(size: 12.5))
        .foregroundStyle(.secondary)
      ProgressView(value: QuotaFormatter.ratio(for: dimension))
        .tint(dimension.nearingLimit ? .orange : .accentColor)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
  }

  private func offerRow(_ purchasableOffer: SubscriptionStore.PurchasableOffer) -> some View {
    Button {
      onPurchase(purchasableOffer.offer)
    } label: {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text(purchasableOffer.offer.name).font(.system(size: 15, weight: .semibold))
          if let description = purchasableOffer.offer.description {
            Text(description).font(.system(size: 12.5)).foregroundStyle(.secondary)
          }
        }
        Spacer()
        if purchasableOffer.offer.name == currentName {
          Text("Current").font(.system(size: 11, weight: .semibold)).foregroundStyle(.tint)
        } else if purchasable, let price = purchasableOffer.displayPrice {
          Text(price).font(.system(size: 14)).foregroundStyle(.secondary)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(!purchasable || purchasableOffer.product == nil || purchasableOffer.offer.name == currentName)
  }
}
```

Add a `QuotaFormatter` enum next to it with `headline(for:)`, `detail(for:)`, and `ratio(for:)`: `ratio` is `used / max(limit, 1)` clamped to `0...1`, `detail` formats with `ByteCountFormatter` when `unit == "bytes"` and plain integers otherwise.

Create `SubscriptionView.swift` — a `NavigationStack` titled "Plan" holding an `OfferSectionView` for `.plan`, one for `.storage` when `snapshot?.managedStorageEnabled == true`, and a final card with "Restore purchases" and "Manage subscription". When `snapshot?.subscriptionProvider == "creem"`, replace that family's purchase rows with the localized line "This subscription is managed on the web." When `store.state == .unconfigured`, hide purchase rows entirely and keep the usage headers. On appear it runs `store.load()`, `store.reconcileUnfinishedTransactions()`, `store.observeTransactionUpdates()`, and `EntitlementStore.shared.refresh()`; `init(focus:)` scrolls to the section matching the reason via `ScrollViewReader`.

- [ ] **Step 6: Move it out of account settings**

Delete `SubscriptionSectionView.swift`. In `AccountSettingsView.swift` remove the `if AfilmoryBuildConfiguration.supportsStoreKitBilling { SubscriptionSectionView() }` block and add, inside the existing actions card, one row "Manage subscription" that calls `SubscriptionStore().manageSubscriptions()`, shown only when `AfilmoryBuildConfiguration.supportsStoreKitBilling`.

- [ ] **Step 7: Add the new strings**

New keys: "Plan", "Managed storage", "Current", "This subscription is managed on the web.", "Billing applies to this workspace. Payment is charged to your Apple ID.", "%@ of %@ used". Add all with the five translations.

- [ ] **Step 8: Regenerate, build, and run the full suite**

Run from `apps/mobile`: `pnpm native:generate && pnpm native:test`
Expected: BUILD and TEST SUCCEEDED, no test regressions.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/NativeApp apps/mobile/modules/photo-masonry/ios/Tests apps/mobile/Afilmory.xcodeproj
git commit -m "feat(mobile): split the subscription surface into plan and storage"
```

---

### Task 8: Studio Plan section

**Files:**
- Modify: `apps/mobile/modules/photo-masonry/ios/Pages/StudioHomeController.swift`
- Create: `apps/mobile/NativeApp/Billing/QuotaWarningCell.swift`
- Modify: `apps/mobile/NativeApp/Resources/Localizable.xcstrings`

**Interfaces:**
- Consumes: `EntitlementStore.shared` (Task 6), `SubscriptionView` (Task 7).
- Produces: a `StudioHomeRoute.plan` case routed by the existing `onNavigate` closure.

- [ ] **Step 1: Add the route and rows**

`StudioHomeController` builds a `[Section]` of `Row` cases. Add a `case quotaWarning(reason: String, title: String, detail: String, ratio: Double)` to `Row`, and a `plan` case to `StudioHomeRoute`. Between the existing Workspace and Overview sections insert:

```swift
    if EntitlementStore.shared.isAvailable, let snapshot = EntitlementStore.shared.snapshot {
      var planRows: [Row] = [
        .navigation(
          title: snapshot.applicationPlan.name,
          detail: storageDetail(snapshot),
          symbol: "creditcard",
          badge: String(localized: "Current"),
          route: .plan
        ),
      ]
      planRows.append(contentsOf: EntitlementStore.shared.warnings.map(warningRow))
      sections.append(Section(title: String(localized: "Plan"), rows: planRows))
    }
```

`warningRow(_:)` maps a `QuotaDimension` to `.quotaWarning`, formatting bytes with `ByteCountFormatter` when `unit == "bytes"` and plain counts otherwise, with `ratio = used / max(limit, 1)`.

- [ ] **Step 2: Render the warning cell**

Create `QuotaWarningCell.swift` — a `UITableViewCell` subclass with a title label in `UIColor.systemOrange`, a detail label, and a `UIProgressView` tinted `.systemOrange`. Register it in `viewDidLoad` alongside the existing cells and return it from `cellForRowAt` for the new case. Use the Apple UIKit palette; no raw hex.

- [ ] **Step 3: Refresh on appear and route**

In `viewWillAppear`, `Task { await EntitlementStore.shared.refresh(); self.reloadSections() }`. In the route handler, `.plan` presents `UIHostingController(rootView: SubscriptionView(focus: nil))`. For a `.quotaWarning` tap, present `SubscriptionView(focus: QuotaWallReason.parse(details: ["reason": reason]))`.

- [ ] **Step 4: Add strings**

New keys: "Plan", "Current", "Storage is %@ full", "%@ of %@ used", "%lld of %lld photos this month". Add with five translations each. Reuse "Plan" and "Current" if Task 7 already added them — a key must appear once.

- [ ] **Step 5: Build and test**

Run: `pnpm native:generate && pnpm native:test`
Expected: BUILD and TEST SUCCEEDED.

- [ ] **Step 6: Verify against a local backend**

Start the local stack, shrink a plan quota through the super-admin dashboard until a dimension passes 80%, run `pnpm --filter @afilmory/mobile ios:local`, sign in as the workspace owner, open Studio, and confirm the Plan section shows the current plan plus a warning row that navigates to the matching section. Capture a screenshot with `xcrun simctl io <udid> screenshot`.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): surface plan and quota warnings in Studio"
```

---

### Task 9: `QuotaWallSheet` and the three entry points

**Files:**
- Create: `apps/mobile/NativeApp/Billing/QuotaWallSheet.swift`
- Modify: `apps/mobile/modules/photo-masonry/ios/Upload/UploadCenter.swift:34,371-395,484`
- Modify: `apps/mobile/modules/photo-masonry/ios/Upload/UploadQueueSheetView.swift`
- Modify: `apps/mobile/NativeApp/Studio/StudioOperationsView.swift`
- Modify: `apps/mobile/NativeApp/Studio/StudioSiteView.swift`
- Modify: `apps/mobile/NativeApp/Resources/Localizable.xcstrings`

**Interfaces:**
- Consumes: `QuotaWallReason` (Task 5), `SubscriptionView` (Task 7).
- Produces: `struct QuotaWallSheet: View` taking `reason: QuotaWallReason` and `onUpgrade: () -> Void`; `UploadJobState.quotaDetails: [String: Any]?` carried from the SSE error event.

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/modules/photo-masonry/ios/Tests/QuotaWallReasonTests.swift`:

```swift
final class UploadQuotaFailureTests: XCTestCase {
  func testKeepsTheStructuredDetailsFromAnErrorEvent() {
    let payload: [String: Any] = [
      "message": "托管存储空间不足",
      "code": 41,
      "details": ["reason": "storage", "usedBytes": 10, "incomingBytes": 5, "capacityBytes": 12],
    ]

    let failure = UploadTerminalFailure(payload: payload)

    XCTAssertEqual(failure.message, "托管存储空间不足")
    guard case .storage? = failure.quotaReason else {
      return XCTFail("A quota rejection must survive the stream.")
    }
  }

  func testAPlainErrorEventCarriesNoQuotaReason() {
    let failure = UploadTerminalFailure(payload: ["message": "boom"])

    XCTAssertEqual(failure.message, "boom")
    XCTAssertNil(failure.quotaReason)
  }

  func testAnEmptyPayloadStillProducesAMessage() {
    XCTAssertFalse(UploadTerminalFailure(payload: [:]).message.isEmpty)
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `-only-testing:AfilmoryTests/UploadQuotaFailureTests`
Expected: FAIL — `cannot find 'UploadTerminalFailure' in scope`.

- [ ] **Step 3: Implement the failure model**

In `UploadCenter.swift`, add near the top:

```swift
struct UploadTerminalFailure: Sendable {
  let message: String
  let quotaReason: QuotaWallReason?

  init(payload: [String: Any]) {
    message = (payload["message"] as? String) ?? String(localized: "The server could not complete the operation.")
    quotaReason = QuotaWallReason.parse(details: payload["details"] as? [String: Any])
  }
}
```

Change `var terminalServerError: String?` (line 34) to `var terminalFailure: UploadTerminalFailure?`. At line 484 build it from the whole payload rather than only its message:

```swift
    case "error":
      state.terminalFailure = UploadTerminalFailure(payload: (payload["payload"] as? [String: Any]) ?? [:])
      tasks[jobId]?.cancel()
```

At line 371 use `failure.message` for `jobs[index].error` and store `failure.quotaReason` on the job so the queue can offer the wall. Add `var quotaReason: QuotaWallReason?` to `UploadJobState`. Separately fix line 395 to pass the real body: `APIError.response(status: status, body: data.flatMap { String(data: $0, encoding: .utf8) })`, threading the response data into that call site.

- [ ] **Step 4: Run test to verify it passes**

Run: `-only-testing:AfilmoryTests/UploadQuotaFailureTests`
Expected: PASS, 3 tests.

- [ ] **Step 5: Build the sheet**

Create `QuotaWallSheet.swift`:

```swift
import SwiftUI

struct QuotaWallSheet: View {
  @Environment(\.dismiss) private var dismiss
  @ObservedObject private var entitlements = EntitlementStore.shared

  let reason: QuotaWallReason
  let onUpgrade: () -> Void

  var body: some View {
    VStack(spacing: 14) {
      VStack(spacing: 9) {
        Image(systemName: "exclamationmark.circle.fill")
          .font(.system(size: 34))
          .foregroundStyle(.red)
        Text(reason.title).font(.system(size: 19, weight: .semibold))
        Text(reason.explanation)
          .font(.system(size: 13.5))
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
      .padding(.top, 8)

      if !reason.readout.isEmpty {
        VStack(spacing: 6) {
          ForEach(reason.readout, id: \.label) { line in
            HStack {
              Text(line.label).foregroundStyle(.secondary)
              Spacer()
              Text(line.value).monospacedDigit()
            }
            .font(.system(size: 13))
          }
        }
        .padding(14)
        .background(Color(uiColor: .systemGroupedBackground))
        .clipShape(.rect(cornerRadius: 10, style: .continuous))
      }

      if entitlements.isAvailable {
        Button(action: onUpgrade) {
          Text("Upgrade")
            .font(.system(size: 16, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: 48)
        }
        .buttonStyle(.borderedProminent)
      } else {
        Text("Ask the workspace owner to upgrade this plan.")
          .font(.system(size: 13))
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }

      Button(reason.secondaryActionTitle) { dismiss() }
        .font(.system(size: 15))
    }
    .padding(22)
    .presentationDetents([.medium])
  }
}
```

Add `var readout: [(label: String, value: String)]` to `QuotaWallReason` in Task 5's file: for `.storage` it returns Used / After this upload / Plan limit formatted with `ByteCountFormatter`; for `.monthlyProcess` Used / Requested / Plan limit as counts; for `.libraryItems` and `.customDomain` Used / Plan limit; for the two size reasons and `.unknown` it returns an empty array, because a per-file ceiling has no running total to show.

- [ ] **Step 6: Wire the three entry points**

In `UploadCenter`, when a batch reaches a terminal state, refresh the snapshot so Studio reflects the new usage:

```swift
    if jobs.allSatisfy({ $0.status == .done || $0.status == .failed || $0.status == .cancelled }) {
      Task { @MainActor in await EntitlementStore.shared.refresh() }
    }
```

Place it in the same locked path that transitions a job to `.done` or `.failed`, after `scheduleEmitLocked()`.

In `UploadQueueSheetView`, a failed job whose `quotaReason` is non-nil gets a trailing "Why?" button presenting `QuotaWallSheet`. In `StudioOperationsView`, parse the SSE error frame's `details` through `QuotaWallReason.parse(details:)` and render the same affordance inline in the failure state. In `StudioSiteView`, catch the domain-binding `APIError`, run `QuotaWallReason.parse(apiError:)`, and show the affordance beneath the form. Upgrade presents `SubscriptionView(focus: reason)`. **No call site presents the sheet automatically.**

- [ ] **Step 7: Add strings**

New keys: "Why?", "Upgrade", "Used", "After this upload", "Plan limit", "Ask the workspace owner to upgrade this plan." Add with five translations.

- [ ] **Step 8: Build and run everything**

Run: `pnpm native:generate && pnpm native:test`
Expected: BUILD and TEST SUCCEEDED.

- [ ] **Step 9: Verify the wall against a local backend**

Shrink the managed storage quota below current usage, run `ios:local`, attempt an upload, and confirm: the upload fails without a modal appearing, the queue row offers "Why?", the sheet shows three numbers, and Upgrade lands on the storage section. Run the memory guard during the session per `apps/mobile/AGENTS.md`. Screenshot each state.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): explain quota rejections where they happen"
```

---

## Verification

After Task 9, run the full gates:

```bash
pnpm --filter core build
pnpm --filter core exec vitest run
pnpm exec eslint --fix $(git diff --name-only main... | grep -E '\.tsx?$')
cd apps/mobile && pnpm native:test
```

The purchase flow itself cannot be exercised locally — `supportsStoreKitBilling` is production-only and the Local variant carries no StoreKit entitlements. Everything else in this plan is verifiable against a local Core.
