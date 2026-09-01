# Mobile gallery features plan (2026-09-02)

Branch: `feat/mobile-gallery-features`. iOS app only (`apps/mobile`). Design approved in chat; no separate spec.

## Global Constraints

- Pure native Swift/UIKit, iOS 18 target, Swift 6. Post-18 APIs need availability guards. Read `apps/mobile/CLAUDE.md` first.
- Zero comments / zero JSDoc-style doc comments in code. Only workaround or hidden-invariant comments.
- Localized strings via `String(localized:)`; the String Catalog auto-extracts at build. Never edit `locales/`.
- Follow existing patterns: singletons with observer tokens, `AfilmoryAPI.shared.request(APIEndpoint)`, `PhotoFeedStore`, `PhotoSyncEngine`.
- `project.yml` is the XcodeGen source of truth. Adding `.swift` files needs no regeneration. Changing `project.yml` requires `pnpm --filter @afilmory/mobile native:generate` and committing the regenerated `Afilmory.xcodeproj`.
- Never pass `CODE_SIGNING_ALLOWED=NO`.
- Verify by building the Local variant: `cd apps/mobile && pnpm ios:local` (or an equivalent `xcodebuild` for the `Afilmory Local` scheme against an iOS 18+ simulator). Run existing tests with `pnpm --filter @afilmory/mobile native:test` when touching tested code.
- Max 500 lines per file. Keep new SwiftUI views under 300 lines.
- No feature flags, no backwards-compat shims.

## Task 1: Explore gallery page header + follow button

Files: `apps/mobile/Afilmory/Features/Pages/GalleryDetailController.swift`, new `apps/mobile/Afilmory/Features/Pages/GalleryHeaderView.swift`, `apps/mobile/Afilmory/Core/Data/GallerySubscriptionStore.swift`, `apps/mobile/Afilmory/Features/Masonry/PhotoMasonryView.swift`, callers in `GalleriesController.swift` and `ExploreDirectoryController.swift`.

Requirements:

1. `GalleryDetailController` gains gallery metadata. Both callers already hold a gallery model (`FeaturedGallery` in `ExploreDirectoryController.swift`, `GallerySubscriptionItem.Gallery` / timeline gallery in `GallerySubscription.swift`). Define one small value type `GalleryHeaderModel { tenantId: String, name: String, slug: String, authorName: String?, authorAvatar: String?, photoCount: Int?, lastUpload: String?, domain: String? }` and map both sources into it. Pass it through init.
2. `PhotoMasonryView` gets a generic top `headerView: UIView?` slot that sits above the existing query header and participates in the same content-inset / height measurement logic. Do not break the query header used by `PhotosHomeController`.
3. New SwiftUI `GalleryHeaderView` hosted in a `UIHostingController` and installed via that slot. Layout: avatar (existing remote image loading pattern used by `GalleryCardCell`; fall back to initials circle), gallery name (title2 semibold), secondary line "N photos · updated <relative time>" using `RelativeDateTimeFormatter` and the existing `NativeStudioFormatters` if suitable, optional domain line as a tappable link opening `https://<domain>` in `SFSafariViewController`. Right side: Follow / Following button. Respect Dynamic Type. Use system colors / materials consistent with `GalleryCardCell`.
4. Follow button: `GallerySubscriptionStore` gains `subscribe(tenantId:)` and `unsubscribe(tenantId:)` async methods calling `PUT` / `DELETE` `gallery-subscriptions/<tenantId>` on the platform base URL (same base as `load`). Update the in-memory `subscriptions` list optimistically and roll back on error. Add `isSubscribed(tenantId:)`.
5. Signed-out state (session not `.signedIn`): tapping Follow calls the existing `onRequestSignIn`. Hide Follow when the gallery is the user's own workspace slug.
6. Error on subscribe/unsubscribe: revert the button state and show a `UIAlertController` with the localized error.
7. Nav title stays the gallery name.

Tests: extend or add a `Tests/GalleryHeaderModelTests.swift` covering the mapping from both source models (photoCount/lastUpload optional handling). Build the Local variant.

## Task 2: Photo detail actions menu — save to Photos, own-photo edit tags / delete

Files: `apps/mobile/Afilmory/Features/Detail/PhotoDetailToolbar.swift`, `apps/mobile/Afilmory/Features/Detail/PhotoDetailViewController.swift`, new `apps/mobile/Afilmory/Features/Detail/PhotoLibrarySaver.swift`, new `apps/mobile/Afilmory/Features/Studio/StudioPhotoMutations.swift`, `apps/mobile/Afilmory/Features/Pages/StudioLibraryController.swift`, `apps/mobile/project.yml` (+ regenerated xcodeproj).

Requirements:

1. The share toolbar item becomes a `UIMenu` (`UIBarButtonItem(menu:)`, keep the same `square.and.arrow.up` glyph): "Share link" (existing `PhotoShareActivity.present` behavior) and "Save to Photos".
2. `PhotoLibrarySaver`: downloads `originalUrl` with `URLSession`, requests `.addOnly` authorization via `PHPhotoLibrary.requestAuthorization(for: .addOnly)`, and saves with `PHAssetCreationRequest`. If `photo.livePhotoVideoURL` is non-nil, download the video too and add it as `.pairedVideo` so the result is a Live Photo; on failure of the paired save fall back to the still image. Show a brief in-place confirmation (reuse `PhotoDetailLoadingPillView` or a simple toast pattern already in the app) and a `UIAlertController` on error, including a "Settings" action when authorization is denied.
3. Add `NSPhotoLibraryAddUsageDescription` to the main app target's Info properties in `project.yml` (both variants share the target). Text: "Allow Afilmory to save photos to your library." Regenerate the project and commit the xcodeproj.
4. Own-photo actions: when `AfilmorySessionStore.shared` state is `.signedIn` and the detail's `gallerySlug` equals the session workspace slug, the same menu also shows a divider then "Edit tags" and destructive "Delete".
5. Extract the network logic of `applyTags` and `deleteSelected` from `StudioLibraryController` into `StudioPhotoMutations` (an enum or final class with static async funcs) that take asset ids and return the committed changes; `StudioLibraryController` calls it, behavior unchanged. Keep `StudioLibraryDeletePolicy` where it is.
6. Detail page needs the asset id for a photo id. `GalleryPhoto` has no asset id; the replica store joins `photos.photo_id` to `studio_assets.asset_id` (`PhotoReplicaRepository.swift`). Add a repository lookup `assetId(forPhotoId:slug:)` and use it. If no asset row exists (studio not yet synced), trigger `PhotoSyncEngine.shared.ensureSynced(slug:includeStudio: true)` and show "Still syncing, try again" instead of failing silently.
7. Edit tags reuses the same comma-separated alert UX as `StudioLibraryController.editTags` (single photo). Delete uses the same confirmation policy (`StudioLibraryDeletePolicy`) and after success dismisses the detail view controller; feeds refresh through the existing `PhotoFeedStore.shared.applyCommitted` + `ensureSynced` path.

Tests: unit test for `StudioPhotoMutations` request building if practical without network; otherwise cover the asset-id lookup with the in-memory repository pattern used in `Tests/`. Build the Local variant.

## Task 3: Home Screen widget — daily photo

Files: `apps/mobile/targets/widgets/index.swift` (split as needed under `targets/widgets/`), new `apps/mobile/targets/widgets/AfilmoryWidgets.entitlements`, `apps/mobile/project.yml` (+ regenerated xcodeproj), new `apps/mobile/Afilmory/Core/Widgets/WidgetSnapshotWriter.swift`, hook in `apps/mobile/Afilmory/Core/PhotoReplica/PhotoSyncEngine.swift`, deep link handling in `apps/mobile/Afilmory/App/` (`GalleryRouteRequest` / `AfilmoryDeepLink`).

Requirements:

1. Widget target: add an entitlements file with `com.apple.security.application-groups` = `group.app.afilmory`, wired in `project.yml` for the Release (production) config only. The Local variant has no App Group; the widget must render a placeholder there.
2. Snapshot contract, shared by both targets via a tiny file `apps/mobile/Afilmory/Core/Widgets/WidgetSnapshot.swift` that is also added to the widget target's sources in `project.yml`: `struct WidgetSnapshot: Codable { var entries: [Entry] }`, `struct Entry: Codable { var date: Date (start of day), photoId: String, gallerySlug: String, imageFileName: String, aspectRatio: Double }`. Stored as `widget-snapshot.json` in the App Group container under `Widgets/`.
3. `WidgetSnapshotWriter` (main app): after a successful replica sync of the user's own workspace (`PhotoSyncEngine` completion path), pick 7 published photos for today and the next 6 days using a deterministic seed (`day number since 1970` hashed with slug) so re-runs are stable, download each `thumbnailUrl` (or a larger variant if the model exposes one) to `Widgets/<photoId>.jpg`, write the JSON, delete image files no longer referenced, then call `WidgetCenter.shared.reloadAllTimelines()`. Skip entirely when `AfilmoryBuildConfiguration.appGroupIdentifier` is nil. Debounce so it runs at most once per hour.
4. Widget: `DailyPhotoWidget` with `TimelineProvider` reading the snapshot; timeline entries at each day's start with `.atEnd` policy. Families: `.systemSmall`, `.systemMedium`. Image fills with `.scaledToFill()` and `.widgetAccentedRenderingMode(.fullColor)`; no text overlay except a small gallery name caption in medium. Placeholder when no snapshot: app icon glyph on `systemBackground` with "Open Afilmory to set up".
5. Tap deep link: `afilmory://photo/<gallerySlug>/<photoId>` (or the existing photo route shape if `AfilmoryDeepLink` already defines one; reuse it). Ensure the app routes to the photo detail.
6. Keep `UploadActivityWidget` working; the bundle now has two widgets.

Tests: unit test for the deterministic daily pick (same inputs → same output, 7 distinct days, handles fewer than 7 photos). Build the Local variant; the widget extension must compile.
