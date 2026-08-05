# Mobile Offline Cache (SwiftData) — Design

**Date:** 2026-08-06
**Scope:** Give the iOS app an offline-first read path: cold start renders the photo grid, explore page, and subscribed galleries from a local SwiftData cache with zero network round-trips, then revalidates in the background. Kill the "offline user gets kicked to signed-out" defect. The read APIs participating in the cache (session, manifest, gallery directory) converge fully on the native side; JavaScript keeps only interactive auth flows.
**Touches:** `apps/mobile/modules/photo-masonry/ios/Persistence/**` (new), `ios/Data/PhotoFeedStore.swift`, `ios/Core/AfilmorySessionStore.swift`, `ios/Core/AfilmoryAPI.swift`, `ios/Pages/GalleriesController.swift`, `ios/Pages/NativePagesModule.swift`, `apps/mobile/src/modules/auth/sessionStore.ts`, `apps/mobile/src/api/auth.ts`, `be/apps/core/src/modules/content/manifest/manifest.public.controller.ts` (+ service). New `.swift` files ⇒ `pod install` required.

## Problem

The app is a native app that behaves like a web page. Cold start renders nothing until **two sequential network round-trips** succeed: `GET /api/auth/session` (JS `hydrateAuth()` blocks the router; native `AfilmorySessionStore.bootstrap()` duplicates the same call from every page controller) and then `GET /api/manifest` (needs the workspace slug from the first). Offline, it is worse than blank: `hydrateAuth()`'s catch treats any failure — including plain network loss — as `resetToSignedOut()`, so a signed-in user with a valid Keychain cookie is redirected to `/explore` as if logged out.

Nothing is persisted except the session cookie (Keychain) and the upload queue (`UploadCenter` JSON file). `PhotoFeedStore` is a process-lifetime in-memory singleton; every launch refetches the full manifest. Images are the only thing that survives a restart (SDWebImage disk cache, untuned defaults).

Photo data never crosses the RN bridge — every primary screen is a native UIKit controller fed by Swift stores. The cache therefore lives on the native side; no JS persistence library helps the first screen.

## Goals

1. Cold start paints the photo grid from local data before any network I/O; a background refresh reconciles afterwards.
2. Offline, the whole visitor browse path works from cache: photos grid, photo detail/viewer (images via SDWebImage disk cache), explore (gallery directory), subscribed gallery feeds.
3. Network failure never signs the user out. Only an explicit 401 does.
4. Steady-state launch refresh costs ~zero bytes: manifest revalidation via `ETag` / `If-None-Match` → 304.
5. One session authority (native); the duplicated JS/native session fetches collapse into one.

## Non-goals

- Comments, reactions, studio (dashboard, data-sync, `GET /api/photos/assets` feed) stay online-only. Offline shows the existing unavailable/placeholder states.
- No offline mutation queue (comments, subscriptions). Upload already has its own persistent queue.
- Photo search (`POST /api/manifest/photos/search`) stays online-only.
- No `updatedSince` / delta manifest API. Full payload + 304 is enough pre-release.
- Interactive auth flows (Apple sign-in handshake, account deletion, workspace switch) stay in JS with better-auth / expo-apple-authentication. Native owns the session they produce, not the flows.
- No proactive image prefetch for offline; the SDWebImage cache fills organically.
- Remaining JS data calls outside the cache scope — studio's `useRemoteResource` endpoints and the galleries search fallback in `src/modules/galleries/api.ts` — are untouched this round; they are online-only features and migrating them buys no offline capability.

## Decisions (confirmed)

1. **SwiftData over Core Data** — iOS 26 deployment target, `@Model` + `ModelActor`, far less boilerplate.
2. **Cache is native-side**, inside the photo-masonry module, because that is where the data lives.
3. **Repository pattern, not `@Query`-driven UI** — SwiftData sits *behind* the existing stores. `@Model` classes never leave the Persistence layer; stores keep publishing the existing value-type structs (`GalleryPhoto`, `SessionInfo`), so masonry/viewer/filter code is untouched.
4. **Backend gets `ETag` support on `GET /api/manifest`** — the one backend change this spec allows.
5. **Cache scope**: session, manifest photo feeds (own workspace + subscribed gallery tenants), gallery directory.

## Architecture

New directory `apps/mobile/modules/photo-masonry/ios/Persistence/`:

- **`AfilmoryDatabase`** — sole owner of the `ModelContainer`; store file in Application Support. Writes go through a `ModelActor`; the cold-start hydration read runs on the main actor so the first publish is synchronous with `bootstrap()`/`load()`.
- **`PhotoCacheRepository`** (protocol + SwiftData implementation) — the only surface stores talk to:
  - `loadFeed(_ key: PhotoFeedKey) -> (photos: [GalleryPhoto], etag: String?)?`
  - `saveFeed(_ key:, photos:, etag:)` / `touchFeed(_ key:)`
  - `loadGalleryDirectory() -> CachedDirectoryPayload?` / `saveGalleryDirectory(_:)`
  - `loadSession() -> SessionInfo?` / `saveSession(_:)`
  - `wipeAll()` / `pruneStale(olderThan:)`
  - An in-memory fake implements the same protocol for tests.

### Data model

| `@Model` | Fields | Notes |
|---|---|---|
| `CachedPhoto` | `photoId`, `feedKey`, `orderIndex`, `takenAt`, `payload: Data` | `payload` is the full `GalleryPhoto` encoded as JSON. Identity is compound `(feedKey, photoId)`; a photo appearing in several feeds is stored once per feed — duplication traded for zero join tables. Indexed fields exist only for ordering/pruning queries. |
| `CachedFeed` | `feedKey`, `etag`, `fetchedAt`, `photoCount` | Per-feed metadata; the ETag lives here. |
| `CachedGalleryDirectory` | singleton row: `payload: Data`, `fetchedAt` | Explore page directory, whole response as JSON. |
| `CachedSession` | singleton row: `payload: Data`, `fetchedAt` | Last successful `SessionInfo`. |

JSON-blob columns are deliberate: `GalleryPhoto` is deeply nested (EXIF etc.) and already `Codable`; per-field columns would force a schema migration every time the manifest shape evolves, for queries we never run.

## Data flow

### Session (native is the single authority)

`AfilmorySessionStore.bootstrap()`:

1. Read Keychain cookie + `CachedSession` → publish signed-in state (workspace slug included) immediately.
2. Kick one background `GET /api/auth/session`; concurrent `bootstrap()` calls from page controllers coalesce into a single in-flight task.
3. On success → update store + `CachedSession`. On network failure → keep cached state, retry on next foreground/launch. On **401** → sign out, wipe cache.

JS `hydrateAuth()` stops fetching. `NativePagesModule` exposes `getSessionSnapshot()` plus a session-change event; `sessionStore.ts` becomes a mirror via `useSyncExternalStore`. JS-initiated flows (Apple sign-in, sign-out, account deletion, workspace switch) complete as today, then hand the resulting cookie to native (`registerNativeSession`), which validates and broadcasts back.

### Photo feeds (stale-while-revalidate)

`PhotoFeedStore.load(key)`:

1. `repository.loadFeed(key)` → if present, publish `.loaded(photos)` immediately. `.loading` (and its `UIContentUnavailableConfiguration` spinner) only appears when there is no cache.
2. Background refresh: `GET /api/manifest` with `If-None-Match: <etag>`.
   - **304** → `touchFeed`; done.
   - **200** → decode, diff against the published array by `photoId` (upsert new/changed, delete missing, rewrite `orderIndex` from response order), publish, write back with the new ETag.
   - Failure → keep published cache silently (log only).
3. The request uses `cachePolicy: .reloadIgnoringLocalCacheData` — `URLCache` would otherwise transparently answer our conditional request from its own cache and we would double-store payloads. We own revalidation; Foundation must not.

Subscribed galleries need nothing new: they already load through `PhotoFeedStore` with `manifest:<slug>` keys per tenant, so they inherit caching automatically.

### Gallery directory

`GalleriesController` follows the same pattern against `CachedGalleryDirectory`: publish cached payload, refetch full (no ETag — the payload is small), overwrite on success.

## Backend change

`manifest.public.controller.ts`, `GET /api/manifest` only:

- Response carries `ETag` derived from a stable content fingerprint: hash of (max photo `updatedAt`, row count) for the tenant. If implementation reveals the manifest service already maintains an equivalent version value, that may substitute — same contract, cheaper query.
- `If-None-Match` match → `304` with empty body.

## Cache lifecycle

- **Sign-out / 401** → `wipeAll()`. SDWebImage cache stays (thumbnails are not tenant-sensitive in a way worth the cold-image penalty; manual clear already exists in ProfileSheet).
- **Workspace switch** → no wipe; data is namespaced by `feedKey` slug, switching back is instant.
- **Startup prune** → delete feeds (and their photos) with `fetchedAt` older than 30 days, so unsubscribed galleries do not accumulate forever.
- **SDWebImage** → configure `maxDiskSize = 512 MB`, `maxDiskAge = 60 days` (currently unlimited defaults).

## Error handling

- Offline with no cache → existing empty/error states with retry; unchanged.
- Refresh failure over cache → silent; cache remains on screen.
- Cached JSON decode failure (schema drift) → drop the row(s), fall through to network; never crash or blank on bad cache.
- SwiftData migration failure → delete the store file and rebuild empty. The cache is reproducible data; the recovery path is always "act like a fresh install".

## Testing

- **Swift unit tests** (existing `native:test` harness): feed diff/upsert incl. reorder and deletion; 304 vs 200 refresh paths; 401 → wipe; network-failure → cached session retained; decode-failure fallback. Repository fake + mocked `AfilmoryAPI` boundary.
- **Backend vitest** (`be/apps/core`): ETag stability for identical content, change on update, `If-None-Match` hit → 304 / miss → 200.
- **Manual acceptance**: simulator cold start in airplane mode → photo grid renders, explore browsable, photo viewer shows cached images, user stays signed in; re-enable network → background refresh reconciles.
