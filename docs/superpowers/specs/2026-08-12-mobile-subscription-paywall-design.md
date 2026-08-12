# Mobile Subscription Surface and Quota Paywall — Design

**Date:** 2026-08-12
**Scope:** Give the iOS app a real subscription home in Studio (application plan and managed storage as two independent sections, with live usage), warn before a quota runs out, and turn every quota rejection into a localized, actionable upgrade prompt instead of a generic failure. Covers the three enforcement paths the app can reach: in-app upload, Studio data sync, and Studio custom domain.
**Touches:** `be/apps/core/src/errors/biz-exception.ts`, `be/apps/core/src/modules/content/photo/assets/photo.controller.ts`, `be/apps/core/src/modules/infrastructure/data-sync/data-sync.controller.ts`, six quota enforcement sites in `be/apps/core/src/modules/{platform/billing/plan,content/photo/assets,infrastructure/data-sync}`, `be/apps/core/src/modules/platform/billing/{billing.controller.ts,overview/**}` (new), `apps/mobile/NativeApp/Billing/**`, `apps/mobile/NativeApp/Studio/**`, `apps/mobile/NativeApp/Authentication/AccountSettingsView.swift`, `apps/mobile/modules/photo-masonry/ios/Upload/UploadCenter.swift`.

## Problem

The billing backend landed with no client surface worth the name.

The only subscription UI is a section inside the account-settings sheet, three levels down from the Photos tab and sitting next to "Sign out" and "Delete account". That placement is wrong on the merits: a subscription belongs to a **workspace** — `billing_subject`'s primary key is `tenant_id` — while account settings is account-scoped. A user in two workspaces sees, on their account page, the subscription of whichever workspace happens to be active.

That section also flattens two different things into one list. The backend generates offers in two independent families, `plan:<id>` (application plan) and `storage:<id>` (managed capacity), and a workspace can hold **both** at once. Presenting them as one list implies they are alternatives.

Studio — the actual workspace-management surface — shows nothing about plans or usage at all.

Worst of all, quota rejections are invisible, and the reason is not the one it first appears to be.

Upload and data sync both stream over SSE (`createProgressSseResponse`). Their handlers catch every exception and emit `sendEvent({ type: 'error', payload: { message } })` with an HTTP status of 200, because the response has already begun (`photo.controller.ts:93`, `data-sync.controller.ts:50`). **The two highest-traffic quota paths never produce an HTTP 402 at all** — the error code and every number are discarded at the controller, leaving one prose string.

Only the custom-domain path is a plain REST call that returns a real 402, and there the client already preserves the body (`AfilmoryAPI.swift:144`).

Either way the copy is hardcoded Chinese prose while the app ships six languages, so it could not be shown as-is even when it arrives intact.

(`UploadCenter.swift:395` separately builds `APIError.response(status:body:nil)` and drops the body. That path handles pre-stream failures only, so it is a correctness fix rather than a blocker for this feature.)

## Goals

- A subscription surface in Studio showing both plan families, current usage, restore, and manage-subscription.
- A warning while there is still room to act, not only at the wall.
- Every quota rejection the app can hit becomes a localized explanation plus a direct upgrade path.
- No regression for BYO-storage, non-owner, Creem, or self-hosted-without-Apple deployments.

## Non-Goals

- **Share extension paywall.** It is a separate target that cannot see app-target code; duplicating the surface there costs more than it returns. It keeps failing generically for now.
- **Bundled offers** ("Pro + 50GB" as one product). The `billing_offer` table supports it, but it would require replanning the App Store Connect product matrix and complicates upgrade paths for anyone who already bought one family.
- **Client-side pre-blocking.** See the invariant below.
- **Automatic retry of the operation that hit the wall.**

## Core Invariant

**The client never blocks an operation based on its local snapshot.** The snapshot drives warnings and copy only; the authority is always the server's rejection. When the snapshot is stale or wrong, the worst outcome is a missing warning — never a blocked upload. Upload buttons are never disabled on quota grounds.

## Architecture

### Backend

**1. `BizException` carries structured details.**

Add an optional `details?: Record<string, unknown>`, surfaced by `toResponse()`. The existing `{ok, code, message}` shape is unchanged, so web and dashboard are unaffected.

**2. Six enforcement sites attach a `reason` and its numbers.** Existing Chinese `message` values stay **byte-for-byte as they are** — web and dashboard still render them; the app ignores `message` entirely and localizes from `details`.

| Site | `reason` | `details` |
| --- | --- | --- |
| `billing-plan.service.ts:140` | `monthly_process` | `limit`, `used`, `requested` |
| `billing-plan.service.ts:157` | `custom_domain` | `limit`, `current` |
| `photo-asset.service.ts:310` | `upload_size` | `limitMb`, `actualMb` |
| `photo-asset.service.ts:381`, `data-sync.service.ts:103` | `library_items` | `limit`, `current` |
| `photo-asset.service.ts:1812`, `:1827` | `storage` | `capacityBytes`, `usedBytes`, `incomingBytes` |
| `data-sync.service.ts:1419` | `sync_object_size` | `limitMb`, `actualMb` |

**3. SSE error events carry the same structure.** `photo.controller.ts:93` and `data-sync.controller.ts:50` widen their payload from `{ message }` to `{ message, code, details }` whenever the caught error is a `BizException`. Without this, the two paths that matter most stay a bare string. Three sites also move from `COMMON_BAD_REQUEST` to the quota error — `photo-asset.service.ts:1436` (upload size), `:1460` (library items), and `data-sync.service.ts:1436` (sync object size). A plan limit reported as a generic 400 cannot be recognized by the client, and today all three are.

**4. `GET billing/overview`** (owner-only, alongside the existing `billing/*` routes) returns one snapshot: current application plan, current storage plan, the five quota limits, current usage per dimension, the provider of the active subscription, and whether managed storage is enabled at all.

Every input already exists; none of them has ever been assembled in one response. `BillingOverviewService` composes `BillingPlanService`, `StoragePlanService`, `BillingUsageService`, and `ManagedStorageService`, keeping the controller thin.

**5. `billing-quota.policy.ts`** is a pure function mapping quotas plus usage to `[{reason, used, limit, unit, nearingLimit}]`.

**The 80% threshold lives here, on the server.** A shipped app cannot change it; this is a product parameter that will be tuned. The client renders `nearingLimit` and never computes it.

### Client

Four new files under the existing `NativeApp/Billing/`:

- **`EntitlementStore`** — singleton holding the snapshot, using the observer-token pattern of `AfilmorySessionStore` (no Combine, matching surrounding code). Refreshes on entering Studio, on upload-batch completion, and after a successful purchase.
- **`BillingOverviewAPI`** — entitlement reads, deliberately separate from `AppStoreBillingAPI`, which handles purchases. One reads state, one mutates money.
- **`QuotaWallReason`** — parses `details.reason` out of either transport (a REST 402 body or an SSE `error` payload) and produces localized copy. Pure, unit-tested.
- **`QuotaWallSheet`** — the shared presentation.

Three existing files change:

- **`SubscriptionSectionView`** (150 lines) becomes a `SubscriptionView` page plus a reusable `OfferSectionView`. With two sections and a usage header it would otherwise pass the 300-line component ceiling.
- **`AccountSettingsView`** drops its subscription section and keeps a single "Manage subscription" row that deep-links to the App Store. That row genuinely is account-scoped — the subscription hangs off the Apple ID — while plans, usage, and purchase are workspace-scoped and move to Studio.
- **`UploadCenter`** keeps `code` and `details` from the SSE `error` event — its `terminalServerError: String?` widens to hold the structured failure — and separately stops discarding the body at `:395`.

## Data Flow

**Warning.** Enter Studio → `EntitlementStore.refresh()` → `StudioHomeController` gains a **Plan** section in its existing table (`Section`/`Row` model, alongside Workspace and Overview): one disclosure row showing the current plan, pushing `SubscriptionView` in a `UIHostingController`, plus one warning row per dimension with `nearingLimit`, tapping through to that section.

The warning is a table row, not a dismissible banner: it appears while the condition holds and disappears when it clears. Nothing to dismiss means no dismissal state to persist and no question about when a dismissal expires.

**Wall.** Operation returns 402 → `QuotaWallReason` parses `details` → `QuotaWallSheet` states current usage against the limit and offers Upgrade → `SubscriptionView` at the relevant section → on successful purchase, refresh the snapshot and dismiss.

The sheet reports **three numbers, not one**: current usage, the projected value after the attempted operation, and the plan limit. "Not enough storage" alone gives the user no way to judge whether to delete a few photos or to upgrade. All three come from `details`.

Every wall also carries a **secondary action that costs nothing** — freeing up space, removing a domain, waiting for the monthly reset — because in each case that genuinely resolves the block. A wall whose only exit is a purchase reads as extortion and earns App Store reviews that say so.

**A 402 never raises a sheet by itself.** Each of the three entry points renders a failure state with an explicit "see why / upgrade" affordance, and only a tap presents the wall:

- Upload — on the failed job in the upload queue.
- Studio data sync — inline in the SSE failure state.
- Custom domain — inline beneath the form.

Uploads run on a background `URLSession`; the user may be on the lock screen or in an unrelated tab when one fails. An automatic modal would interrupt a context that has nothing to do with the purchase.

## Error Handling and Edge Cases

**Non-owner (admin).** Quota enforcement requires `admin`, but `billing/*` requires `owner`, so an admin can hit a wall they cannot clear. `billing/overview` returns 403; `EntitlementStore` marks itself unavailable and stops retrying; the Plan section does not appear in Studio at all. The wall still appears, worded as "quota exhausted — ask the workspace owner to upgrade", with no purchase button.

**BYO storage.** A workspace on its own S3 has no managed-storage quota. The storage dimension comes back null, and the storage section and its warnings disappear. Given how self-host-oriented Afilmory is, this is likely the majority case, not an edge.

**Existing Creem subscription.** `ensureNoOverlappingProvider` rejects an overlapping App Store purchase with 409 at `purchase-context`. Rather than let the user discover this by tapping, the overview reports the active provider and the affected section replaces its purchase button with "managed on the web".

**App Store not configured** (`offers.configured == false`, e.g. a self-host without Apple credentials). Plans and usage still render; purchase entry points are hidden. The page degrades into a read-only usage view, which is still worth having.

**Offline.** Render from the cached snapshot and fail refresh silently, mirroring how `PhotoFeedStore` keeps stale manifest rows instead of entering `.failed`.

**After a successful purchase**, refresh the snapshot and dismiss the wall. Failed uploads are retried by the user from the upload queue, which already offers both bulk and per-job retry (`UploadQueueSheetView.swift:112`, `:307`). Automatically replaying a batch of background jobs has no controllable timing, and the user may no longer want them sent.

## Testing

**Backend (vitest).** `billing-quota.policy.spec.ts` carries the weight: threshold boundaries (79% / 80% / 100% / already over), `limit: null` meaning unlimited produces no warning, zero usage produces no false positive. `BillingOverviewService` gets two tests only — storage null under BYO, and provider passthrough for Creem. The rest of its composition is not worth mocking four services for.

**Client (XCTest, `modules/photo-masonry/ios/Tests`).** `QuotaWallReason` parsing is the core: one realistically-shaped 402 per reason, asserting reason and numbers. **An unknown reason must degrade to generic copy rather than crash or render blank** — the server will add dimensions while old builds are still in the field. `EntitlementStore` gets two: 403 marks unavailable and stops retrying; a failed refresh preserves the previous snapshot. The API layer is injected as a fake, following the `AppStoreAcknowledgementPort` pattern.

SwiftUI views themselves are not tested; per `apps/mobile/AGENTS.md` the verification surface is `native:test` plus a Simulator build.

**Manual verification splits cleanly.** The warning row and the wall depend only on the backend's 402 and overview — no StoreKit — so both are fully exercisable on `Afilmory Local` against a local Core by shrinking a plan quota and uploading a few photos. The purchase flow cannot run there at all (`supportsStoreKitBilling` is production-only; Local has no entitlements) and waits for TestFlight/Sandbox. The split means no variant gate has to be loosened for testing, and most of the new code lands on the locally-verifiable side.

## Not Blocking Implementation

Offer names, prices, quota numbers, and the free managed-storage allowance are App Store Connect and system-setting configuration, not code. Nothing in the client hardcodes them: offers arrive from `billing/overview` and `billing/app-store/offers`, prices from `Product.displayPrice`. The mockups use placeholders and the screens adapt to whatever the catalog says.

## Open Items Deferred

- `inAppOwnershipType` is still unchecked, so a Family Sharing member's transaction attributes to the purchaser's workspace. Needs a product rule before code.
- `BizException` messages remain English/Chinese server-side. The app localizes from `details` and never shows them, but a future dashboard caller would see raw strings.
