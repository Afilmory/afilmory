# Mobile Offline Cache — Implementation Plan

Spec: `docs/superpowers/specs/2026-08-06-mobile-offline-cache-design.md` (read it if a task's intent is unclear; task text below is authoritative for requirements).

## Global Constraints

- **Zero comments / zero JSDoc** in all code (Swift and TS). A comment is allowed only for a workaround/quirk or a hidden invariant a reader would otherwise reverse.
- **`@Model` classes never leave the Persistence layer.** Stores publish the existing value types (`GalleryPhoto`, session structs). UI files (Masonry/, Viewer/, Filters/) must not change.
- **Adapt to existing names.** Where this plan sketches a signature, the existing codebase's type/method names win; behavior contracts are binding, spelling is not.
- **New `.swift` files are invisible until `pod install`** (podspec glob is expanded at install time). After adding/removing Swift files run `pod install` in `apps/mobile/ios` (or re-run prebuild) before building/testing.
- **Native tests**: from `apps/mobile` — first time: `pnpm native:locales && npx expo prebuild -p ios`, then `pnpm native:test`. Test sources live in `apps/mobile/modules/photo-masonry/ios/Tests/`.
- **Backend tests**: vitest in `be/apps/core` — `pnpm --filter core exec vitest run <file>`. Follow existing `*.spec.ts` patterns in that app.
- **Lint/type-check only what you touched**: `pnpm lint <paths>`, `pnpm --filter @afilmory/mobile type-check` for mobile TS.
- **ETag contract**: fingerprint of tenant manifest content = hash over (max photo `updatedAt`, photo count); `If-None-Match` match → `304` with empty body.
- **Conditional native requests** must set `cachePolicy: .reloadIgnoringLocalCacheData` so Foundation's `URLCache` cannot answer revalidations itself.
- **Lifecycle rules**: wipe all cached data on sign-out or 401; never wipe on workspace switch; prune feeds with `fetchedAt` older than 30 days at startup; SDWebImage `maxDiskSize` 512 MB, `maxDiskAge` 60 days.
- **Error rules**: cached-JSON decode failure → drop rows, fall through to network, never crash; SwiftData container open/migration failure → delete store file, rebuild empty; background refresh failure with cache on screen → keep cache silently.
- Commit per task with a conventional message (`feat(mobile): …`, `feat(be): …`, `test: …`). Never add AI co-authorship lines.

## Task 1: Backend manifest ETag

**Files:** `be/apps/core/src/modules/content/manifest/manifest.public.controller.ts`, its service, and a new/extended `*.spec.ts` beside existing manifest tests.

`GET /api/manifest` must:

1. Compute a stable content fingerprint for the tenant's manifest: hash (sha1/md5 — pick what the codebase already uses, e.g. node `crypto`) over `(max updatedAt across the tenant's synced photos, photo count)`. If the manifest service already maintains an equivalent monotonic version value, use it instead — same contract, cheaper. Look before building: check `manifest.service.ts` and the drizzle schema for an existing version/updatedAt aggregate.
2. Send it as a strong `ETag` response header on 200 responses.
3. When the request carries `If-None-Match` equal to the current ETag, return `304` with an empty body and the same `ETag` header, skipping manifest body serialization (it is fine to still run the cheap fingerprint query; it is NOT fine to build the full manifest payload on the 304 path).
4. Behavior of every other manifest endpoint is unchanged.

Framework note: this is the tsuki-hono (NestJS-style) framework — controllers use decorators; get access to raw request headers/response the way neighboring controllers do (check existing usages of headers/context in `be/apps/core` before inventing a pattern).

**Tests (vitest):**
- identical content → identical ETag across two calls
- fingerprint input change → different ETag
- `If-None-Match` with current ETag → 304, empty body
- `If-None-Match` stale value → 200 with body + new ETag
Follow the existing manifest/controller test setup in `be/apps/core` (mock service or test harness — mirror neighboring specs).

**Verify:** scoped vitest run passes; `pnpm lint <changed files>`.

## Task 2: Native persistence foundation (SwiftData)

**Files (new):** `apps/mobile/modules/photo-masonry/ios/Persistence/AfilmoryDatabase.swift`, `Persistence/CacheModels.swift`, `Persistence/PhotoCacheRepository.swift`, `Persistence/SwiftDataPhotoCacheRepository.swift`, `Persistence/InMemoryPhotoCacheRepository.swift`, tests in `ios/Tests/PhotoCacheRepositoryTests.swift`.

Build the persistence layer exactly as the spec's Architecture section defines:

1. **`AfilmoryDatabase`**: owns the single `ModelContainer`; store file under Application Support (subdirectory `AfilmoryCache`). If container creation throws (migration/corruption), delete the store file and recreate empty — the cache is reproducible; never crash. Provide a test initializer using an in-memory `ModelConfiguration`.
2. **`@Model` classes** (see spec Data model table): `CachedPhoto` (`photoId`, `feedKey`, `orderIndex`, `takenAt`, `payload: Data`; `#Unique` on `(feedKey, photoId)`; `#Index` on `feedKey`), `CachedFeed` (`feedKey` unique, `etag: String?`, `fetchedAt: Date`, `photoCount: Int`), `CachedGalleryDirectory` (singleton row: `payload: Data`, `fetchedAt`), `CachedSession` (singleton row: `payload: Data`, `fetchedAt`).
3. **`PhotoCacheRepository` protocol** — the only surface stores will use. Required operations (adapt spelling to existing types like `PhotoFeedKey`, `GalleryPhoto`, and the native session struct):
   - `loadFeed(key) -> (photos: [GalleryPhoto], etag: String?)?` — photos ordered by `orderIndex`; decode failures of individual payloads drop those rows (and delete them) rather than failing the load
   - `saveFeed(key, photos, etag)` — full replace for that key: upsert by `(feedKey, photoId)`, delete rows absent from `photos`, rewrite `orderIndex` from array order, update `CachedFeed` row (`etag`, `fetchedAt = now`, `photoCount`)
   - `touchFeed(key)` — update `fetchedAt` only
   - `loadGalleryDirectory() -> Data?` / `saveGalleryDirectory(Data)`
   - `loadSession() -> Data?` / `saveSession(Data)` / `clearSession()`
   - `wipeAll()`
   - `pruneStale(olderThan: Date)` — delete `CachedFeed` rows older than the cutoff and their `CachedPhoto` rows
4. **Threading contract**: the load/hydration methods must be callable synchronously from `@MainActor` (main-context reads); mutations go through a `ModelActor` so they never block the main thread. Hide the split inside `SwiftDataPhotoCacheRepository`; the protocol may expose async mutations + sync reads.
5. **`InMemoryPhotoCacheRepository`**: dictionary-backed fake implementing the same protocol, for tests of the stores in later tasks.

No store wiring yet — this task is the layer plus its own tests.

**Tests:** round-trip save/load of a feed (order preserved, etag persisted); upsert replaces changed payloads and deletes missing photos; corrupted payload row is dropped and deleted on load; `pruneStale` removes only stale feeds + their photos; `wipeAll` empties everything; session/directory round-trips.

**Verify:** from `apps/mobile`: `pnpm native:locales && npx expo prebuild -p ios` (first prebuild in this worktree), then `pnpm native:test`. Existing tests must stay green.

## Task 3: Feed stale-while-revalidate + conditional GET

**Files:** `apps/mobile/modules/photo-masonry/ios/Core/AfilmoryAPI.swift`, `ios/Data/PhotoFeedStore.swift`, tests `ios/Tests/PhotoFeedStoreCacheTests.swift`.

1. **`AfilmoryAPI`**: the manifest request gains conditional support — accept an optional etag; set `If-None-Match` when present; `cachePolicy = .reloadIgnoringLocalCacheData`; surface the outcome as a three-case result: `.notModified`, `.success(payload, etag: String?)` (etag read from the response header), or error. Keep the existing call shape for other endpoints. If `AfilmoryAPI` is not yet injectable into `PhotoFeedStore`, introduce the minimal seam (protocol or closure) needed for tests — mirror how `CommentsTransport` did it if such a seam exists.
2. **`PhotoFeedStore.load(key)`** becomes stale-while-revalidate:
   - hydrate: `repository.loadFeed(key)` → if non-nil, publish `.loaded(photos)` immediately; `.loading` only when there is no cache
   - refresh (always, after hydrate): conditional manifest fetch with the stored etag
     - `.notModified` → `repository.touchFeed(key)`; no publish
     - `.success` → decode via existing `ManifestDecoding`, publish new array, `repository.saveFeed(key, photos, etag)`
     - failure with cache on screen → keep published photos, log only; failure with no cache → existing error state (unchanged behavior)
   - `force` reload keeps working and skips nothing except it must still send `If-None-Match` (a 304 on force is still valid)
   - repository is injected (default: the SwiftData one; tests use `InMemoryPhotoCacheRepository`)
3. The `studio` feed key is out of scope: it must bypass the cache entirely (no hydrate, no save) — guard by key kind, not by string comparison hacks.

**Tests** (repository fake + mocked API): cold start with cache publishes cached photos before any network completion; 304 path touches feed and keeps array identity; 200 path publishes and persists new order/deletions; refresh failure keeps cached photos; no-cache path shows loading then loaded; studio key never touches the repository.

**Verify:** `pod install` in `apps/mobile/ios`, then `pnpm native:test`.

## Task 4: Native session authority + JS mirror

**Files:** `apps/mobile/modules/photo-masonry/ios/Core/AfilmorySessionStore.swift`, `ios/Pages/NativePagesModule.swift`, `apps/mobile/src/modules/auth/sessionStore.ts`, `apps/mobile/src/native/` (session bridge surface), tests `ios/Tests/SessionStoreCacheTests.swift`.

**Native:**

1. `bootstrap()`: synchronously publish last known state — Keychain cookie + `repository.loadSession()` (decode the persisted session struct; treat decode failure as no cache). If both cookie and cached session exist → signed-in state with workspace slug available immediately.
2. All concurrent `bootstrap()`/refresh calls coalesce into one in-flight `GET /api/auth/session` task; page controllers calling `bootstrap()` repeatedly must not stack requests.
3. Refresh outcome: success → publish + `repository.saveSession(encoded)`; network/server failure (timeouts, 5xx, no connectivity) → keep current state; **HTTP 401 specifically** → transition to signed-out, clear Keychain cookie, `repository.wipeAll()`.
4. Explicit sign-out (user action via JS) keeps its current path and additionally triggers `repository.wipeAll()`.

**Bridge (`NativePagesModule`):** expose `getSessionSnapshot()` (sync or promise returning the serialized session state JS already understands) and a `sessionChange` event fired on every native session state transition.

**JS:**

5. `sessionStore.ts`: `hydrateAuth()` no longer fetches `/api/auth/session`. It reads the native snapshot and subscribes to `sessionChange`; the store remains a `useSyncExternalStore` source with the same public selectors so route guards (`tabAccess.ts`, `src/app/index.tsx`, `(tabs)/_layout.tsx`) keep working unchanged. A network failure can no longer produce `resetToSignedOut()` — only a native-reported signed-out state can.
6. Auth flows (Apple sign-in, sign-out, account deletion, workspace switch) stay as they are; their completion already hands the cookie to native (`registerNativeSession`) — verify the handoff still triggers a native refresh + broadcast, and that JS-side sign-out reaches the native store (so wipe + broadcast happen).

**Tests:** Swift — bootstrap with cached session publishes signed-in before network; coalescing (N concurrent bootstraps → 1 request); failure keeps state; 401 wipes repository and Keychain (use `InMemoryPhotoCacheRepository` + mocked API/Keychain seam as the store's design allows). JS behavior is covered by type-check + the route guards' unchanged contract; no new JS test harness.

**Verify:** `pod install` + `pnpm native:test`; `pnpm --filter @afilmory/mobile type-check`; `pnpm lint <changed TS files>`.

## Task 5: Gallery directory cache

**Files:** `apps/mobile/modules/photo-masonry/ios/Pages/GalleriesController.swift` (and whatever native store/service it uses to fetch `GET /api/gallery-directory`), tests appended to an appropriate existing/new test file.

1. On load: `repository.loadGalleryDirectory()` → if present, decode and render immediately (loading state only when empty), then refetch the directory unconditionally; on success re-render and `repository.saveGalleryDirectory(data)`; on failure keep rendered cache silently.
2. Decode failure of cached data → ignore cache, fall through to network.
3. If the directory fetch currently lives inline in the controller, extract the minimal loader seam so the cache path is testable — do not rebuild the controller.

**Tests:** cached directory renders before network; refresh overwrites; corrupt cache falls through.

**Verify:** `pod install` (if files added) + `pnpm native:test`.

## Task 6: Lifecycle wiring — prune + SDWebImage limits

**Files:** app/module startup path (where the masonry module or app delegate first initializes — follow where SDWebImage or `PhotoFeedStore` is first touched), `Persistence/` if a helper is needed; small test for the prune cutoff.

1. Once per app launch (background priority, off the main thread, after first paint concerns — not blocking startup): `repository.pruneStale(olderThan: now - 30 days)`.
2. Configure `SDImageCache.shared.config.maxDiskSize = 512 * 1024 * 1024` and `maxDiskAge = 60 * 24 * 3600` at the same initialization point.
3. Double-check Task 4 left no sign-out path that skips `wipeAll()`.

**Tests:** prune cutoff boundary (29-day-old feed survives, 31-day-old feed and its photos deleted) — likely already covered by Task 2's repository tests; add only what's missing at the wiring level (e.g. the launch hook calls prune exactly once).

**Verify:** `pnpm native:test`.

## Task 7: Whole-feature verification

No production code except fixes for what this task uncovers.

1. Full native suite: `pnpm native:test` from `apps/mobile` (after `pod install`).
2. `pnpm --filter @afilmory/mobile type-check`.
3. `pnpm lint` scoped to every TS file the branch touched.
4. Backend: scoped vitest for the manifest module.
5. `pnpm --filter @afilmory/mobile bundle` (export sanity check).
6. Best-effort simulator smoke (do not block on it): build/launch the app on an iPhone simulator, screenshot the explore tab signed-out. Use `xcrun simctl` + `axe`; never control the mouse. If the environment makes this impractical, say so explicitly in the report instead of faking it.

Report every command with its outcome. Any failure → fix within this task if mechanical, otherwise report BLOCKED with specifics.
