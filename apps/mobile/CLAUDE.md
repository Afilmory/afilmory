# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `apps/mobile/AGENTS.md` (Simulator/Agent-Testing rules, memory guard) and `apps/mobile/RELEASE.md` (signing, TestFlight, StoreKit) before doing anything that runs or ships the app.

## This is a pure native Swift app

The Expo / React Native app was deleted in `66fae030 feat(mobile): rewrite app in native Swift`. There is no Metro, no JS runtime, no Hermes, no CocoaPods, and no npm dependencies — `package.json` exists only to expose XcodeGen/xcodebuild through pnpm. Leftovers that mean nothing now: the Expo/Metro entries in `.gitignore`, and the empty untracked `src/` directories.

The root `CLAUDE.md`'s "Mobile App (`apps/mobile`)" section still describes the Expo era (prebuild, Development Pod, `pod install`, `expo-glass-effect`, iOS 26 deployment target). **Ignore it in favor of this file** — only its "iOS only, forever", `axe` automation, and String Catalog points survived the rewrite.

## Commands

```bash
pnpm --filter @afilmory/mobile native:generate   # xcodegen generate --spec project.yml
pnpm --filter @afilmory/mobile ios:local         # generate + build 'Afilmory Local' (Debug) for iPhone 17 Pro
pnpm --filter @afilmory/mobile ios:production    # generate + build 'Afilmory' (Release)
pnpm --filter @afilmory/mobile native:test       # generate + xcodebuild test (scheme 'Afilmory Local')
pnpm dev:mobile                                  # alias for ios:local (root)
```

Single test class / method — append `-only-testing` to the raw xcodebuild invocation:

```bash
xcodebuild test -project Afilmory.xcodeproj -scheme 'Afilmory Local' \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:AfilmoryTests/PhotoFilterEngineTests/testMatchesGoldenFilterCases
```

There is no lint/format/type-check step for Swift here — `native:test` and a Simulator build are the verification surface.

## Project generation (XcodeGen, not Expo prebuild)

`project.yml` is the source of truth. `Afilmory.xcodeproj` is generated output **but is committed** — regenerate it and commit the diff; never hand-edit it or add files through the Xcode UI.

Sources are directory globs (`NativeApp`, `modules/photo-masonry/ios` minus `Tests/**`), so nesting new subdirectories is free — but **adding or deleting a `.swift` file requires `native:generate`** before Xcode sees it. (This replaces the old `pod install` requirement.)

Dependencies: SwiftPM only — SDWebImage, pinned to an exact version in `project.yml`.

## Two build variants from one source tree

| | Local | Production |
| --- | --- | --- |
| Scheme / config | `Afilmory Local` / Debug | `Afilmory` / Release |
| Bundle ID | `app.afilmory.local` | `app.afilmory` |
| URL scheme | `afilmory-local` | `afilmory` |
| Default API | `http://localhost:1841` | `https://api.afilmory.art` |
| App Group | none | `group.app.afilmory` |

The variant flows `project.yml` build settings → `Info.plist` (`AfilmoryAppVariant`, `AfilmoryURLScheme`, `AfilmoryAppGroupIdentifier`) → `AfilmoryBuildConfiguration`. That enum is the single gate for variant-conditional capabilities (`supportsAppleAuthentication`, `supportsPushNotifications`, `supportsShareExtension`, `supportsStoreKitSponsorship`, `allowsApiEnvironmentOverride`). **Add new capability gates there** rather than scattering `#if DEBUG` or bundle-ID checks. Local carries only its default Keychain access group for native session persistence, so Sign in with Apple, APNs, share-extension handoff, Live Activities, and StoreKit remain unavailable there by construction.

## Source layout

Both roots compile into the **same** `Afilmory` target; the split is historical (`photo-masonry` was once an Expo module) and is not a module boundary.

- `NativeApp/` — app shell (`App/`), `Authentication/`, `Studio/` (SwiftUI screens + `NativeStudioAPI`), `Routing/` (deep links), `Design/` (`AdaptiveGlass`, `NativeControls`), `Resources/` (String Catalogs, asset catalogs).
- `modules/photo-masonry/ios/` — everything gallery-side plus the shared infrastructure every screen depends on: `Core/` (`AfilmoryAPI`, `APIEndpoint`, `AfilmorySessionStore`, `AfilmoryBuildConfiguration`, `ThumbHash`), `Session/`, `Data/`, `Persistence/`, then feature folders (`Masonry/`, `Detail/`, `Viewer/`, `Comments/`, `Upload/`, `Sheets/`, `Pages/`, `Filters/`, `Map/`, `Transition/`, `Push/`, `Models/`).
- `targets/share/` and `targets/widgets/` — separate app-extension targets. They do **not** see app-target code; the share extension re-declares its own `group.app.afilmory` constant and its own String Catalog.

## Runtime architecture

**Session drives the root view controller.** `SceneDelegate` → `ApplicationCoordinator.start()` observes `AfilmorySessionStore` and swaps the window root per `AfilmorySessionState`: `.loading` → `LoadingViewController`, `.signedIn` → `AfilmoryTabBarController` (Photos / Map / Explore / Studio), `.signedOut`/`.failed` → a visitor-only Explore nav stack. `replaceRoot` is type-compared, so re-renders of the same state are no-ops. Deep links parsed by `AfilmoryDeepLink` are buffered in `pendingDeepLink` and only applied once the root is no longer `LoadingViewController` — tab indices are hardcoded there (Explore `2`, Studio `3`), so reordering tabs means updating `applyPendingDeepLinkIfPossible`.

**UIKit-first, SwiftUI at the leaves.** Scrolling, gestures, transitions, and the masonry grid are UIKit (`PhotoMasonryView` is a `UICollectionView` with a custom `MasonryLayout` and a pinch-driven column count). Settings-shaped screens are SwiftUI wrapped in `UIHostingController`. Don't rewrite a working UIKit surface in SwiftUI.

**Singletons with observer tokens, not Combine.** `AfilmorySessionStore.shared`, `PhotoFeedStore.shared`, `UploadCenter.shared`, `ApiEnvironmentStore.shared`. Observation is a closure + cancellation token (`observe { }` → `AfilmorySessionObservationToken` / `PhotoFeedObservationToken`); feeds additionally use `@Observable`. Mutable shared state is guarded by an `NSLock` under `@unchecked Sendable`, with `@MainActor` reserved for anything touching UI or SwiftData's `mainContext`.

## Networking: platform vs tenant base URLs

`APIEndpoint.baseURL` is `.platform`, `.tenant`, or `.explicit`, resolved against the session snapshot in `AfilmoryAPI.resolveURL`. This is the most common source of wrong-host bugs:

- **platform** — the account/auth service (`auth/session`, push registration, Studio APIs), from `ApiEnvironmentStore.platformAPIBaseURL()`.
- **tenant** — the *active workspace's* gallery, at `<slug>.<baseDomain>/api`. It is only populated after `ApiEnvironmentStore.activateTenant(slug:)` runs, which `AfilmorySessionStore` does on every session resolve. A `.tenant` request made before a workspace is active throws `missingTenantBaseURL`.
- Gallery slugs are regex-validated before being interpolated into a host.

Auth is a **session cookie held in the Keychain** (`kSecAttrAccessibleAfterFirstUnlock`, deliberately — background upload retries recreate requests while the device is locked), attached manually per request; there is no `HTTPCookieStorage`. `401` anywhere triggers a full sign-out plus cache wipe. Retries are opt-in per endpoint via `APIEndpoint.retryPolicy` (transient GETs only: 408/429/5xx/transport).

The API environment can be overridden at runtime **only in Debug builds** (`allowsApiEnvironmentOverride`), persisted to the Keychain. Per `AGENTS.md`, reset it to the variant default after custom-environment testing.

## Caching (SwiftData)

`PhotoCacheRepository` is the seam; `SwiftDataPhotoCacheRepository` is the live one and `InMemoryPhotoCacheRepository` backs tests. Reads are synchronous on `@MainActor` via `container.mainContext`; **all writes go through the `@ModelActor PhotoCacheMutator`** — don't mutate models from the main context.

`PhotoFeedStore` keys feeds by `PhotoFeedKey` (`.manifest(slug)` / `.studioLibrary`). Manifest feeds are cached with an ETag and refetched conditionally: `304` → `touchFeed` only; a refresh failure with cache present logs and keeps the stale rows rather than surfacing `.failed`. Only `.manifest` feeds read from cache — Studio library is always live. Sign-out calls `wipeAll()`.

## Localization

String Catalogs only; there is no runtime locale loader and the iOS app does **not** consume the repo's `locales/` JSON.

- `NativeApp/Resources/Localizable.xcstrings` — keys are the English source text, auto-extracted from `String(localized:)` / `Text(_:)` at build time.
- `NativeApp/Resources/ExifValues.xcstrings` — dotted keys (`<prefix>.<slugified-value>`) resolved dynamically in `PhotoInfoFormatters.translatedExifValue` via `Bundle.main.localizedString(forKey:value:table:)`. **These are not auto-extracted** — add entries by hand, and note the slugging rules (lowercase, `&`→`and`, non-alphanumerics→`-`).
- `targets/share/Localizable.xcstrings` — the share extension's own catalog.

Shipping languages are declared in `project.yml` (`CFBundleLocalizations`): en, zh-Hans, zh-Hant, zh-HK, ja, ko.

## iOS 18 target with iOS 26 opt-ins

`IPHONEOS_DEPLOYMENT_TARGET` is **18.0** (Swift 6, `SWIFT_STRICT_CONCURRENCY: targeted`). Post-18 APIs need an availability guard *and* an iOS 18 fallback. Liquid Glass goes through `AdaptiveGlass`, which falls back to `UIBlurEffect`/`.filled()` — prefer it over inline `#available` checks for glass surfaces.

Gotcha that still applies: `UIGlassEffect.isInteractive = true` swallows touches meant for buttons hosted in the effect view's `contentView` — keep it off for tappable glass.

## Tests

XCTest with `@testable import Afilmory`, in `modules/photo-masonry/ios/Tests` (excluded from the app target, built into `AfilmoryTests`). They are behavior/logic tests — decoding, state machines, cache repositories, geometry, formatters — not UI tests.

`Tests/Fixtures/*.json` are **golden fixtures captured from the web TypeScript implementation**: the Swift EXIF/header/info formatters and filter engine must reproduce the web app's output byte-for-byte across all six languages. Treat a fixture mismatch as a port bug, not a fixture to update. `scripts/generate-native-fixtures.mjs` is the receiving half of that capture; its producer half lived in the deleted RN app, so the checked-in fixtures are currently the only source.
