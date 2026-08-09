# iOS Native Localization — Design

**Date:** 2026-08-09
**Scope:** Replace the RN-era JSON string catalog in the iOS app with native Apple localization: String Catalogs (`.xcstrings`), English literals as keys, `String(localized:)` / `Text(_:)` at call sites, and the OS's own plural and locale resolution. Delete the hand-rolled `Localization` / `LanguageTag` / `PluralRule` runtime, the `locales/mobile` namespace, the bundle-copy script, and the `*LocalizationRecord` payload structs that existed only to ferry copy across the RN bridge.
**Touches:** `apps/mobile/NativeApp/Resources/{Localizable,ExifValues}.xcstrings` (new), `apps/mobile/targets/share/Localizable.xcstrings` (new), 25 `.swift` files with call sites plus ~10 more that hold the payload structs, `apps/mobile/project.yml`, `apps/mobile/package.json`, `apps/mobile/scripts/sync-locales.sh` (deleted), `locales/mobile/**` (deleted), root `CLAUDE.md`.

## Problem

The iOS app localizes through machinery built for React Native, and every piece of it is now dead weight or an active liability:

- `modules/photo-masonry/ios/Localization/Localization.swift` loads `app-<lang>.json` + `mobile-<lang>.json` from the bundle into `[String: String]`, then does `replacingOccurrences(of: "{{name}}")` interpolation and English fallback by hand.
- `LanguageTag` re-implements language resolution (`zh-Hant` → `.traditionalChinese`, `ja-JP` → `.japanese`) that `Bundle` / `Locale` already do correctly, and its `jp` tag is not a valid language code.
- `PluralRule` is a two-case stub — `english && count == 1 ? .one : .other` — paired with i18next `_one`/`_other` key suffixes. It cannot express any CLDR category beyond `one`/`other`, and it hardcodes the claim that no language other than English has a `one` form.
- `scripts/sync-locales.sh` copies 12 JSON files into the app bundle at build time, including all 440 keys × 6 languages of the web SPA's `app` namespace, of which iOS touches 157.
- Of the 366 keys in `locales/mobile`, Swift references 318; the rest are RN leftovers that translation work still pays for.
- `PhotoFilterLocalizationRecord`, `ProfileLocalizationRecord`, `UploadReviewLocalizationRecord`, `PhotoInfoLocalizationPayload`, `CommentLocalization`, and `uploadQueueLocalization() -> [String: String]` exist only because copy used to be serialized into props for JS views. They are ~500 lines of structs whose sole job is copying strings from a controller into a SwiftUI view that could have asked for them itself. One still carries the comment *"JS hands over raw {count} templates"*.
- `targets/share/ShareLocalization.swift` is 170 lines of six-language copy hardcoded into a Swift struct, with its own `{count}` templating and its own `hasPrefix("zh-hk")` language sniffing.

The app is native Swift now (`66fae03 feat(mobile): rewrite app in native Swift`). There is no JS consumer left. `project.yml` already sets `LOCALIZATION_PREFERS_STRING_CATALOGS: YES` and targets iOS 18 — the native path is paved and unused.

## Goals

1. One localization mechanism, and it is Apple's: String Catalogs + `String(localized:)` / `Text(_:)`.
2. Plural, language resolution, and fallback come from the OS, not from repo code.
3. Copy is visible in English at the call site; new strings are auto-extracted into the catalog at build time.
4. Delete every RN-shaped indirection: the JSON runtime, the sync script, the record/payload structs, the share extension's hardcoded table.
5. No user-visible change. All six languages keep working.

## Non-goals

- `locales/app` and `locales/dashboard` stay. The web SPA owns `app` and keeps its i18next flow; only `locales/mobile` is deleted.
- No new languages, no copy rewrites, no translation review. Existing translations move across verbatim.
- `targets/widgets` needs no work — it has no translatable copy (only `Text("\(done)/\(total)")` and a dynamic title).
- No translation-management tooling. Editing `.xcstrings` in Xcode is the workflow.

## Decisions (confirmed)

1. **`.xcstrings` is the single source of truth for mobile.** `locales/mobile/**` is deleted, not kept in sync.
2. **Keys are the English source text** (Apple's default flow) — `Text("Cancel")`, `String(localized: "Ownership will transfer to \(name).")`. Xcode extracts new keys at build time. Trade-off accepted: editing English copy re-keys the entry and Xcode marks translations stale.
3. **`*LocalizationRecord` / payload structs are dissolved**, not re-plumbed. Views localize themselves.
4. **The share extension migrates too**, to its own `targets/share/Localizable.xcstrings`.
5. **`zh-TW` becomes `zh-Hant`**, matching Apple's script-code convention. `zh-HK` stays and still wins for Hong Kong users (region beats script in Apple's resolution).
6. **The conversion script is one-shot and not committed.** It runs once from the scratchpad; afterwards the catalogs are edited directly.

## Inventory

Measured against the current tree. Call sites take two forms — the static `Localization.t(…)` and the instance `localization.value(…)` — and both must be counted; the instance form is the majority.

| | count |
|---|---|
| Swift files with call sites | 25 |
| Literal key references | 373 |
| Runtime-interpolated key references | 3 |
| Keys resolving in `locales/mobile` | 318 |
| Keys resolving **only** in `locales/app` | 55 (`exif.*` field labels) |
| Keys present in both (mobile wins; 7 genuinely differ) | 15 |
| **Distinct static catalog entries after de-duplication** | **376** |
| — of those, needing plural variations | 11 |
| — of those, containing placeholders | 32 |
| EXIF *value* keys reached only through the dynamic lookup | 102 under the prefixes in use; **all 201 `exif.*` keys ship** (see below) |
| `locales/mobile` keys with no Swift reference | 48 (dropped) |

### Collisions

Re-keying by English text merges 14 groups of previously distinct dotted keys. Eleven are byte-identical in every language. Three differ, all at synonym level:

| English | Keys | Divergence |
|---|---|---|
| `Check your connection and try again.` | `gallery.failed.detail`, `studio.error.description` | zh-HK/zh-TW: 重試 vs 再試 |
| `{{count}} lenses` | `filter.summary.lenses_other`, `profile.stats.lenses_other` | zh-TW: 顆鏡頭 vs 支鏡頭 |
| `{{count}} photos` | `gallery.photos_other`, `profile.stats.photos_other` | zh-HK: 張照片 vs 張相片; ja: spacing |

Each merges to one entry; the conversion picks the first translation and the loss is a synonym, not a meaning.

### Plurals

Sixteen `_one`/`_other` pairs are referenced, but only **11** have different English forms (`{{count}} lens` / `{{count}} lenses`, `{{count}} matching photo` / `photos`, …). The other five — including `studio.upload.review.startTemplate` and `studio.upload.queue.failedTemplate` — have identical `one` and `other` values and collapse to plain entries with `%lld`.

Eight keys use single-brace `{count}` / `{done}` / `{total}` / `{attempt}` instead of `{{…}}`: the templates that used to be handed to JS raw. The conversion must accept both brace styles.

## Design

### Two catalogs, two key styles

The 373 literal references and the dynamic EXIF lookup are different problems and get different tables:

- **`Localizable.xcstrings` — English-literal keys.** Everything written as a literal in Swift. Auto-extracted by the compiler; the call site reads as English.
- **`ExifValues.xcstrings` — dotted data keys.** The 102 EXIF *values* (`exif.metering.mode.spot`, `exif.white.balance.auto`, …) that `PhotoInfoFormatters.translatedExifValue` reaches by slugifying an EXIF string at runtime. These are data, not source literals; no extraction tool can see them, and they must stay keyed by slug.

`translatedExifValue` becomes:

```swift
Bundle.main.localizedString(forKey: "\(prefix).\(suffix)", value: text, table: "ExifValues")
```

`localizedString(forKey:value:table:)` is the native primitive behind `NSLocalizedString` and takes the raw EXIF text as the default — exactly the `defaultValue:` fallback the current code hand-rolls, minus the hand-rolling.

The table ships **every** `exif.*` key (201), not just those under the thirteen prefixes currently passed to `translatedExifValue`. The lookup key is assembled at runtime from slugified EXIF text, so a missing entry degrades silently to the raw English value — `exif.fujirecipe-whitebalance.*` was missed on the first pass exactly this way and only surfaced through the zh-Hans golden test.

**Accepted consequence:** the EXIF value translations will exist in two places — `locales/app/*.json` for the web viewer and `ExifValues.xcstrings` for iOS — and can drift. The alternative (keeping a JSON pipeline alive for one table) costs more than the drift does: these are closed enumerations of EXIF constants that change only when a camera vendor adds a mode.

The 55 `exif.*` **field labels** (`exif.film.mode`, `exif.rating`, …) are static literals in Swift and move into `Localizable.xcstrings` as ordinary English keys, not into `ExifValues`.

### Catalog generation (one-shot)

A throwaway script reads `locales/{mobile,app}/{en,zh-CN,zh-HK,zh-TW,jp,ko}.json` and emits three catalogs, resolving each key mobile-first then app (matching `Localization.catalog`'s merge order, which 7 keys depend on).

**Key derivation** — take the English value and substitute placeholders:

- `{{count}}` / `{count}` → `%lld`
- any other `{{x}}` / `{x}` → `%@`
- **The catalog key must be non-positional even with several arguments** — `Uploaded %lld of %lld`, not `Uploaded %1$lld of %2$lld`. Swift extracts `String(localized: "Uploaded \(done) of \(total)")` in source order with plain specifiers; a positional key does not match, the lookup misses, and every language silently renders the English source. Only the *translations* use `%n$`, which is what lets Chinese and Japanese reorder the clauses. `LocalizedFormatTests` pins this.

**Language mapping** — `en`, `zh-CN`→`zh-Hans`, `zh-TW`→`zh-Hant`, `zh-HK`→`zh-HK`, `jp`→`ja`, `ko`→`ko`.

**Output shape** (validated against real Xcode-authored catalogs on disk):

```json
{
  "sourceLanguage": "en",
  "version": "1.0",
  "strings": {
    "Ownership will transfer to %@.": {
      "localizations": {
        "zh-Hans": { "stringUnit": { "state": "translated", "value": "所有权将转移给 %@。" } }
      }
    },
    "%lld matching photos": {
      "localizations": {
        "en": { "variations": { "plural": {
          "one":   { "stringUnit": { "state": "translated", "value": "%lld matching photo" } },
          "other": { "stringUnit": { "state": "translated", "value": "%lld matching photos" } }
        } } },
        "zh-Hans": { "variations": { "plural": {
          "other": { "stringUnit": { "state": "translated", "value": "%lld 张匹配的照片" } }
        } } }
      }
    }
  }
}
```

English needs explicit `en` plural variations — the key alone carries only the `other` form. Chinese, Japanese, and Korean carry only `other`, which is correct for their CLDR rules and is the one fact `PluralRule` had right.

Catalog locations:

- `apps/mobile/NativeApp/Resources/Localizable.xcstrings` and `ExifValues.xcstrings` — main app. `NativeApp/Resources` is already a compiled resource group (it holds `Assets.xcassets`), so catalogs there compile rather than being copied raw.
- `apps/mobile/targets/share/Localizable.xcstrings` — built from the copy currently hardcoded in `ShareLocalization.swift`. Extensions have their own bundle and need their own catalog.

### Call-site rewrite

| Situation | Before | After |
|---|---|---|
| Plain, SwiftUI | `Text(Localization.t("common.cancel"))` | `Text("Cancel")` |
| Plain, UIKit / `String` | `localization.value("common.cancel")` | `String(localized: "Cancel")` |
| Interpolated | `.value("account.deletion.transferTo", ["name": n])` | `String(localized: "Ownership will transfer to \(n).")` |
| Plural | `.value("…summaryTemplate_one")` + `_other` + manual pick | `String(localized: "\(count) items")` |
| Dynamic status key | `.value("studio.comments.status.\(status)")` | `switch` over the five statuses, one literal each |
| Dynamic EXIF value | `.value("\(prefix).\(suffix)", defaultValue: text)` | `Bundle.main.localizedString(forKey:value:table: "ExifValues")` |

Only the two dynamic cases change shape. The comment-status key interpolates one of five known values, so it becomes an exhaustive `switch` — which also makes it extractable. The EXIF case cannot be made static and keeps a runtime lookup, which is why it gets its own table.

### Dissolving the payload structs

Each record is deleted and its consumers ask for copy directly:

- `PhotoFilterLocalizationRecord` — `PhotosHomeController` stops filling 24 fields; `PhotoFilterSheetView` / `PhotoFilterViewModel` inline the literals. `PhotoFilterSheetRequest` keeps only `anchor`, `filters`, `options`.
- `ProfileLocalizationRecord` — same for `ProfileSheetView`.
- `UploadReviewLocalizationRecord` — including its `start(count:)` / `summary(count:)` `{count}` templating, replaced by catalog plural variations.
- `uploadQueueLocalization() -> [String: String]` in `StudioLibraryController` — a stringly-typed 16-entry dictionary consumed by `UploadQueueSheetView`; deleted outright.
- `PhotoInfoLocalizationPayload` (`PhotoDetailModels`) — `PhotoInfoSheetView` / `PhotoInfoSectionsList` localize themselves.
- `CommentLocalization` (`CommentModels`) — 20 fields plus a `locale` string. `CommentsStore` drops the parameter; `CommentRowView`'s `.locale(Locale(identifier: store.localization.locale))` is deleted so the date style uses the environment locale.

### Locale plumbing after `LanguageTag` dies

`LanguageTag` did double duty: picking the string table *and* supplying a locale identifier to date formatters (`PhotoInfoModel`, `DateRange`, `PhotoHeaderModel`).

The bundle selects strings according to its active localization, while `Locale.current` can retain the device's region locale when the user selects a different per-app language. The `localeIdentifier:` parameters on those initializers stay, and production callers derive their formatting locale from `Bundle.main.preferredLocalizations.first` through `PhotoDateLanguage.activeLocaleIdentifier`. The same seam makes Xcode's `-testLanguage` matrix deterministic.

The second duty survives as `PhotoDateLanguage` (`Models/PhotoDateLanguage.swift`): the photo header and info sheet hand-format dates per language (`yyyy年M月d日`, `yyyy/MM/dd`, `yyyy. M. d.`), so an arbitrary locale identifier still has to collapse onto one of the six. That is a formatting concern, not a string-table one, and it keeps the golden fixtures byte-identical.

### Tests

- `Tests/LocalizationTests.swift` is deleted. It covers `LanguageTag.resolve`, `PluralRule.category`, `{{}}` interpolation, and English fallback — all four become OS behaviour, and testing them would be testing Foundation.
- `PhotoHeaderModelTests` / `PhotoInfoModelTests` used to loop over `LanguageTag.allCases` in one process. They cannot any more: the models now localize through `Bundle.main`, so a run only ever sees one language. Each test resolves the fixture from the bundle's active localization (`NativeFixtureLanguage`), so the golden comparison becomes a matrix over `xcodebuild -testLanguage` runs instead of an in-process loop. Coverage is unchanged; it just takes six invocations.
- New `LocalizedFormatTests` asserts that interpolated literals actually hit the catalog rather than falling back to English. It skips under `en`, where a hit and a fallback are indistinguishable.

### Project configuration

- `project.yml`: drop `modules/photo-masonry/ios/Resources/Locales` from `resources`; set `CFBundleLocalizations` to `en / zh-Hans / zh-Hant / zh-HK / ja / ko`.
- `package.json`: delete `native:locales`; `native:generate` reduces to `xcodegen generate --spec project.yml`.
- Delete `apps/mobile/scripts/sync-locales.sh`, `modules/photo-masonry/ios/Resources/Locales/`, `modules/photo-masonry/ios/Localization/`, `targets/share/ShareLocalization.swift`, `locales/mobile/`.
- Root `CLAUDE.md` line 159 claims three locale namespaces; it becomes two (`app/`, `dashboard/`) plus a note that mobile uses String Catalogs.

**`knownRegions` — risk did not materialise.** XcodeGen has no `knownRegions` option and derives regions from `*.lproj` names ([ProjectSpec docs](https://github.com/yonaskolb/XcodeGen/blob/master/Docs/ProjectSpec.md)), which String Catalogs do not produce. XcodeGen 2.45.4 reads the languages out of the `.xcstrings` themselves: the generated project lists `Base, en, ja, ko, zh-HK, zh-Hans, zh-Hant`, and all six `.lproj` directories appear in the built app. No `.lproj` stubs were needed.

## Verification

1. `pnpm --filter @afilmory/mobile ios:local` builds clean.
2. Inspect the built `.app`: `Localizable.strings` (or `.loctable`) present under `en.lproj`, `zh-Hans.lproj`, `zh-Hant.lproj`, `zh-HK.lproj`, `ja.lproj`, `ko.lproj`. This is the direct check on the `knownRegions` risk.
3. Simulator run under `zh-Hans` and `ja`: photos home, filter sheet, profile sheet, photo info sheet, upload review, upload queue, comments sheet, studio comments. Screenshot each via `xcrun simctl io … screenshot`, driving with `axe`. Any English string or raw dotted key on screen is a failure.
4. Photo info sheet on a Fujifilm photo in `zh-Hans` — exercises the `ExifValues` table and its raw-text fallback for an unmapped value.
5. Plural check: upload review with 1 and 3 items in `en` (`1 item` / `3 items`) and `zh-Hans` (single form both times).
6. Share extension: share 1 and 2 photos from Photos.app in `zh-Hans`.
7. `pnpm --filter @afilmory/mobile native:test`, plus the golden matrix: `xcodebuild test … -testLanguage <lang> -testRegion <region>` for `zh-Hans/zh_CN`, `zh-Hant/zh_TW`, `zh-HK/zh_HK`, `ja/ja_JP`, `ko/ko_KR`.
8. `grep -rn "Localization\.\|localization\.value\|LocalizationRecord\|{{" apps/mobile --include=*.swift` returns nothing.
