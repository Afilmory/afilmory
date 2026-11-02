# Mobile App Redesign — Exhibition / Viewing / Darkroom — Design

**Date:** 2026-11-02
**Scope:** Full visual and structural redesign of the native iOS app (`apps/mobile`). New tab structure (展览 Exhibition · 观展 Viewing · 暗房 Darkroom), a new home screen, a sheet-based photo detail, the map folded into the exhibition, a restyled following/discovery surface, an upload-first studio, a new type and colour system, and a "focus" motion language applied to every transition.
**Touches:** `apps/mobile/Afilmory/App/**` (tab shell, coordinator, deep links), `Afilmory/DesignSystem/**` (new tokens, fonts, motion primitives, accent extraction), `Afilmory/Features/Pages/**` (Photos/Explore/Studio home controllers), `Features/Masonry/**`, `Features/Detail/**`, `Features/Map/**`, `Features/Upload/**`, `Features/Studio/**`, `Features/Sheets/**`, `Afilmory/Resources/**` (fonts, String Catalog), `project.yml` (font resources, `UIAppFonts`), `Tests/**`.
**Backend:** no API changes required.
**Visual reference (source of truth for look and motion):** Design canvas "Afilmory iOS · 摄影展首屏" — https://claude.ai/artifact/VP9F8B8T6nkVSm4Ty5h1bj. The interactive boards H1–H5 are the approved prototypes; this document states every decision in text as well, so the canvas is a reference, not a dependency.

## Intent

Afilmory is a social photo-exhibition app. Today it looks and behaves like a generic gallery: a masonry wall, system-blue accent, a Map tab that is usually empty, and a Studio that reads like an admin console. The redesign makes it feel like walking through a photography exhibition while staying "semi-native": UIKit structure, system gestures, sheets and lists where the job is management, and a distinctive layer of type, colour and motion where the job is looking at photographs.

The brand vocabulary is film photography — shutter, focus, film — expressed through **motion and typography, never through texture**. No sprocket holes, fake grain, film-frame borders or camera-brand skins.

## Goals

- Opening the app feels like an exhibition opening: one photograph is "exposed" on screen before anything else.
- Overview and recall stay as easy as Apple Photos: every photo is reachable by scrolling a dense, chronological contact sheet.
- Every transition speaks one language: focus. Things coming forward rack into focus; things going back defocus.
- Each photographer's space carries their own colour, taken from their photographs, with no fixed brand colour.
- Upload is the primary action of the studio tab and is pleasant to watch.
- Photo aspect ratios are respected everywhere a photo is shown as content (no forced crops in cards).

## Non-goals

- Android, iPad-specific layouts, macOS.
- Backend or API changes. Everything here uses data the app already receives.
- EXIF "photographer fingerprint" cards (most-used camera/focal length/time of day per gallery). Rejected: it is offline tagging work, should not be computed live, and current data volume doesn't justify it.
- Web app (`apps/web`), dashboard, SSR, marketing site.
- New features in Studio sub-pages (Data, Sync, Domain keep their current content and only adopt the new visual system).
- The rejected explorations on the canvas: A "projector" as home, C "depth wall", L2 "white cube", L3 "edge print" language, red/orange fixed accents, the large two-row Viewing header, cropped-hero cards.

## Anti-goals (would make this a failure even if it works)

- It reads as a camera-brand skin (Leica red, Hasselblad orange, Fujifilm green, Nikon yellow; sprocket holes; LCD date stamps as decoration).
- Motion slows the user down: an animation blocks scrolling or input, can't be interrupted, or makes the overview harder to scan.
- Photos are cropped into awkward ratios inside cards, or cards leave empty space under short content.
- Invented data appears in production UI (fake counts, fake locations, fake titles).

## Constraints

- iOS 18.0 deployment target, Swift 6, UIKit-first with SwiftUI at settings-shaped leaves (see `apps/mobile/AGENTS.md`). Post-18 APIs need availability guards and an iOS 18 fallback; glass goes through `AdaptiveGlass`.
- `AfilmoryBuildConfiguration` remains the single gate for variant capabilities; `Afilmory Local` lacks push, Live Activities, share-extension handoff.
- Localization through String Catalogs only; every new string goes through `String(localized:)` in all six shipping languages.
- Deep-link tab indices are hardcoded in `ApplicationCoordinator.applyPendingDeepLinkIfPossible` and must be updated with the new tab order.
- The existing data model is what we have: in the owner's current library, `title` is the filename for all 18 photos, `description` is empty, and `location` is empty. Layouts must not depend on titles, descriptions or GPS.

## Information architecture

| Tab | Purpose | Replaces |
| --- | --- | --- |
| 展览 Exhibition (index 0) | The signed-in user's own gallery: opener, contact sheet, map level, projection mode | Photos tab + Map tab |
| 观展 Viewing (index 1) | Other people's galleries: following timeline and discovery | Explore tab |
| 暗房 Darkroom (index 2) | Upload first, then library management, replies, site, account | Studio tab |

- The Map tab is removed. The map becomes the farthest level of the contact-sheet scale (see Exhibition).
- Account settings and sign-out move from the Exhibition (old Photos) menu into Darkroom, together with everything else the old profile menu and Studio home held: plan / subscription entry and quota warnings, StoreKit sponsorship, clear cache, and delete account (the App Store requires account deletion to stay reachable). See Darkroom.
- Exhibition keeps the existing search and filters (`PhotoFilterStore`, `PhotoQueryHeaderView` logic): a glass search/filter button sits in the Exhibition top bar left of `放映`; an active query filters the opener pool and the contact sheet, and shows a dismissible query chip under the section header.
- The DEBUG developer-lab gesture moves from five taps on tab index 3 to five taps on the Darkroom tab (index 2).
- Signed-out visitors keep the current single-stack experience, restyled: Viewing's 展厅 (galleries) page without the tab bar.
- Deep links: `.photos` and `.map` both resolve to Exhibition (`.map` additionally switches the scale to ∞ when location data exists, else stays on 日); `.explore` → Viewing (index 1); `.studio` → Darkroom (index 2).

## Visual system

### Colour

- Ground `#0E0D0C`; raised surface `#141311`; sheet `#161513`; strip/film base `#1C1A17`; fill `#22201D`; hairline `#22201D`/`#2A2825`; tick/inactive `#3A3733`.
- Text primary `#EDE9E3`; secondary `#B5B0A8`; tertiary/labels `#8C877F` (passes 4.5:1 on the ground).
- Destructive text `#FF8A7E`.
- **No fixed brand accent.** The accent is extracted from the photograph currently in focus (see Accent extraction) and is used only for: the frame-number marker `▸ NN`, the active progress tick, the tab bar's focus-confirmation dot, segmented-control underlines, avatar rings in Viewing, the scale index mark `▾`, progress bars. Everything else is monochrome.
- When no photo is in context, the accent falls back to `#EDE9E3`. There is no site-level accent override (the app does not receive galleries' configured `accentColor`, and adding one would need backend work).
- The app is dark-only for the gallery surfaces; settings-shaped sub-pages follow the same palette.

### Type

| Role | Face | Notes |
| --- | --- | --- |
| Exhibit text: gallery name, frame numbers `No. 03`, dates `2026.07.26`, author names, scale labels 日 月 年 ∞, large stats | TeX Gyre Schola Regular / Italic | GUST Font License, bundle both `.otf` (~140 KB each). Track display sizes at about −0.02em; use Italic for captions like `清晨 05:46` and scientific names. Never Bold. |
| CJK display text that the app itself ships (page titles 展览 / 观展 / 暗房, 印样, 冲洗新照片, 审片 …) | Source Han Serif SemiBold, **subset** | Only the glyphs used by the app's static strings are bundled (see Font subsetting). Never used for user-generated text. |
| UI: buttons, tabs, list rows, body | SF Pro (system) | Supports Dynamic Type; CJK falls back to PingFang automatically. |
| EXIF, edge-print metadata, counts | SF Mono (system, `monospacedSystemFont`) | |

Rule: serif appears only on exhibits (things being looked at); everything operable uses SF Pro.

**User-generated text never uses the CJK serif.** Tags, photo titles, gallery names, comments and search input use Schola for Latin with the system CJK fallback (PingFang / Hiragino / Apple SD Gothic) for CJK — e.g. a tag used as the Detail title (`旅鸫`) renders in PingFang Semibold, not Source Han Serif.

### Font subsetting

- Source: the Source Han Serif SemiBold region fonts (SC, TC, HK, JP, KR; SIL OFL).
- A repo script (e.g. `apps/mobile/scripts/subset-fonts`, using `fonttools`' `pyftsubset`) harvests every character from the display strings in `Localizable.xcstrings` for each CJK localization, plus Latin and digits, and writes one small subset font per region into `Afilmory/Resources/Fonts/`. The subsets are committed and registered in `project.yml` (`UIAppFonts`).
- The script is re-run whenever display strings change; a unit test fails when a display string contains a character missing from its region's subset. At runtime, any missing glyph falls back to the system CJK font through the normal cascade, so a stale subset degrades gracefully instead of rendering tofu.
- The serif face is picked by the current UI language (zh-Hans → SC, zh-Hant → TC, zh-HK → HK, ja → JP, ko → KR).

### Shape

- Device-concentric corners: floating sheets are inset 8 pt from the screen edges with 47 pt corner radius (concentric with the 55 pt display corner); when a sheet expands to full height it attaches to the edges with top corners 47 pt.
- Cards 28 pt; mosaics inside cards 14 pt; thumbnails 12 pt; chips/pills fully rounded.
- Glass (via `AdaptiveGlass`) only for floating controls over photos: back, more, reactions, share, 放映, 全屏, close.

### Motion: the focus language

Defined once in DesignSystem and reused everywhere:

| Primitive | Behaviour |
| --- | --- |
| Rack focus (enter) | blur ~24→0, scale 1.06→1, opacity 0→1, ~650–750 ms spring |
| Defocus (exit / recede) | blur 0→8–12, scale →0.95–0.985, opacity →0.35–0.55 |
| AF hunt and lock | blur 7→0 (overshoot scale 0.98) → slight re-blur 1.6 → sharp; a 4 pt accent dot pops (scale 0→1.8→1) at lock; light haptic at lock |
| Exposure | circular iris reveal from centre, over-exposed (brightness ~2.4) and blurred at first, then focus with one small hunt; ~1.5 s |
| Develop | negative → positive: invert 1→0, grayscale 0.7→0, blur 3→0, driven by real progress |

All motion must be interruptible and never block scrolling or touches. With Reduce Motion enabled, blur/scale/iris effects are replaced by short cross-fades and the AF hunt becomes an immediate state change.

## Accent extraction

Port of the prototype algorithm (it intentionally differs from the web viewer, which uses the image's average colour and turns a robin into grey-brown):

1. Downscale the thumbnail (or ThumbHash render) to about 64 px; quantize to ~10 colours.
2. Discard clusters with HSV saturation < 0.28 or value < 0.28.
3. Score each remaining cluster `s³ × (area fraction)^0.2 × (0.6 + 0.4·v)` so a small, saturated subject (a robin's breast at 2 % of the frame) can win over large foliage.
4. Convert the winner to HSL, clamp saturation to ≥ 0.45, set lightness to 0.66, then nudge toward white or the ground until contrast against `#0E0D0C` is between 4.8 and 9.5.
5. No cluster qualifies → `#EDE9E3`.

Cache per photo id. Results on the current library for calibration: robin → `#D79F7A`, hydrangea → `#56AEFB`, night pavilion → `#EC9E65`. Known weakness: pink petunias against foliage still pick green; acceptable for v1.

## 展览 Exhibition (canvas boards H1, H3)

### Layout (top to bottom)

1. **Top bar** (transparent, gains a blurred ground and hairline after 24 pt of scroll): `AFILMORY` mono label left; a glass `▶ 放映` button right; when the section title scrolls under the bar, `AFILMORY` fades out and the gallery name fades in at the same leading spot (Schola 17, tail-truncated), and `▶ 放映` shrinks to a 36 pt ▶ circle matching Search; scrolling back reverses it (plain 0.25 s fade, no blur). Visitor galleries keep the back chevron and put the name right after it.
2. **Opener (开场一帧):** one photograph, 366 × 470 pt card (12 pt side insets, 28 pt radius, aspect-fill). A random photo from the user's own feed on every cold launch. Below it a caption: accent dot, Schola Italic `开场 · No. 07`, and mono `date · time-of-day · camera`. Right of the caption, a `再曝光` button picks a different random photo and replays the exposure.
3. **Section header:** Schola 30 `印样` with a mono caption that changes per level (`18 帧 · 12 天 · 按拍摄日剪开`, `18 帧 · 8 个月`, `18 帧 · 3 年`, `∞ · 有位置的照片铺在地图上`). Right of it, the **focus-distance scale** `日 · 月 · 年 · ∞`: four Schola labels over small tick marks, the active one marked by an accent `▾`.
4. **Contact sheet (印样):** photos grouped by local calendar day (日), month (月) or year (年), each group a "film strip" on the film-base colour with tiny mono frame numbers above each frame and a group label above the strip (`07.19 · 2 帧`). Frame heights 72 / 56 / 40 pt by level, widths by aspect ratio. Strips pack greedily into rows; a strip wider than the screen scrolls horizontally on its own. Year dividers (mono year + hairline) at 日 and 月.
5. Tab bar.

### Behaviour

- **Entrance:** the opener plays Exposure; caption, title, strips (staggered ~70 ms), then the tab bar rise in with a small upward rack focus. Total ≈ 1.2 s, input accepted immediately.
- **Scroll:** the opener moves at ~0.35× (parallax), shrinks slightly and fades as it leaves (no blur). Rows stay sharp while scrolling (a focal-plane blur was built and removed on 2026-11-02: it read as noise, not focus).
- **Scale changes (日/月/年):** tap a label or pinch on the contact sheet (pinch out = farther). Strips regroup and rise in with a short stagger.
- **∞ (map level):** visible only when at least one photo has a location. Located thumbnails lift off their strips and fly to their map positions (clusters fan slightly, ±7°). The map is a card (366 × 300, 28 pt radius) using MapKit with a dark style, showing photo pins as 52 pt rounded thumbnails with a white border. Under the card: `另有 N 帧没有位置信息` with a note that they remain in 日 · 月 · 年. A glass `全屏` button on the card expands **only the map card** to full screen: the window grows to the screen bounds and the radius goes to 0, the map gains area rather than scaling (≤1.15× zoom), a close button, `∞` title and `N 处 · M 帧` chip fade in, and a bottom sheet card lists the located frames. Close reverses it. Pins and list items open Detail.
- **Search and filters:** the top-bar search/filter button opens the existing filter UI restyled; results narrow the opener pool and the strips at every level, including ∞.
- **Opening a photo** from the opener, a strip, a map pin or the map list: shared-element transition into Detail (existing `Transition/` animators are the starting point); the sheet behind scales to ~0.95 and defocuses; the tab bar slides away. Back reverses to the exact source frame.
- **放映 (projection mode):** opened from the top-bar button with a circular reveal centred on the button. Full-screen black; photos aspect-fit in the centre, advancing every 3.6 s with rack-focus transitions; a 2 pt progress line in the current photo's accent; edge-print metadata (`▸ NN`, date, camera, EXIF line); large Schola frame number `07 / 18`; previous/next buttons reset the timer; close reverses the reveal. Starts at the opener photo.

## Detail (canvas board D1)

- The photograph is the page: aspect-fit, full width, in the area above the collapsed sheet. Glass back and more buttons at the top.
- **Sheet** (two detents, `UISheetPresentationController`-style behaviour or a custom equivalent that keeps the photo interactive):
  - **Collapsed (~200 pt, inset 8, radius 47):** Schola 28 date `2026.07.26` + Schola Italic time-of-day `清晨 05:46`; `Camera · Lens` in SF 13; EXIF line in SF Mono 12 (`600mm  f/6.3  1/250s  ISO 1400  ±0 EV`); tag chips when tags exist. If the photo has a real title (not filename-like), the title takes the large line and the date moves to the italic line.
  - **Expanded (attached to edges, ~736 pt):** sections that exist in `PhotoInfoSheetModel`: Exposure & metering (program, metering, white balance), File (format, MP, dimensions, size, filename, colour space), Tone (toneAnalysis type + brightness/contrast/shadow/highlight bars in the accent), then conditional sections only when data exists — Description, Rating, Location + map (tapping opens Exhibition at ∞ centred on the photo), Fuji recipe, Attribution — and a Comments entry row.
  - When expanded, the photo behind scales to ~0.86, moves up slightly and defocuses.
- **Existing viewer behaviour is kept:** horizontal paging between photos, pinch-zoom, Live Photo playback and drag-to-dismiss all stay. While the sheet is collapsed, paging, zoom and dismiss work on the photo as today; zooming in hides the sheet and chips (immersive), zooming back out restores them. While the sheet is expanded, paging and dismiss are disabled until it collapses. On every page change the `No. NN` pill, accent, and sheet contents update with a short rack-focus cross-fade.
- **Original loading (decided 2026-11-03, artboard `detail-loading`):** while the full-size original downloads, a 2 pt line in the photo's accent runs along the photo's bottom edge over a faint track, with a mono readout under it (`▸ ORIGINAL` · `16.1 / 38.4 MB`). It appears only after 0.35 s so cached originals never flash it; on finish the line runs to 100 % and both fade out in 0.3 s. Unknown size: a short accent segment sweeps the line and the readout shows only MB received (no sweep under Reduce Motion). Failure: line and readout give way to a glass `Retry original` button centred near the photo's bottom, and the preview stays. Tall photos keep the line and readout just above the chips row. Each page keeps its own state; the indicator moves with the photo and hides while zoomed.
- **Location from someone else's photo** opens that photographer's gallery page at ∞ centred on the photo (own photos open the Exhibition tab at ∞). Gallery pages are the same module as Exhibition, so they have the scale and the ∞ level too; in visitor mode the gallery page is pushed on the visitor stack.
- Riding on the sheet's top edge (and moving with it): a glass pill `● No. 03` (accent dot) on the left; glass reaction and share buttons on the right. The reaction button keeps the existing reaction rail behaviour.
- Time-of-day words from local `dateTaken`: 深夜 0–5, 清晨 5–8, 上午 8–11, 正午 11–13, 午后 13–17, 傍晚 17–19, 夜晚 19–24.

## 观展 Viewing (canvas board H4)

- **Header:** one 98 pt glass bar: Schola 24 `观展` left; two segments `新冲洗 · 展厅` right. Content scrolls under it.
- **Segments are pages** in a `UIPageViewController` (horizontal swipe or tap). Scroll progress drives, continuously: each segment's accent underline (`scaleX = 1 − |progress − index|`), and each page's blur (up to 8 pt) and opacity (down to 0.4). When the page settles, its label plays AF hunt and lock.
- **新冲洗 (default when the user follows anyone):** the existing subscription timeline. Grouped by date chapters (Schola 28 `07.26` + mono year). One **roll** = one gallery's photos from one local day (the existing timeline post). Roll card (28 pt radius, raised surface): header button — 36 pt avatar with an accent ring (accent of the roll's first photo), Schola 17 gallery name, mono `冲洗了 N 帧 · 时段`, chevron — then the **mosaic**.
- **展厅:** search field; `你关注的展厅` cards; `发现` cards (existing gallery directory). Card: header row (avatar, Schola name, mono `N 帧 · 最近 date`, follow pill) then the mosaic of up to 5 recent photos. Following/unfollowing updates both segments immediately. With no follows, Viewing opens on 展厅.
- **Mosaic (aspect-true justified layout):** 1 photo → full width at its own ratio, height capped at 400 pt (narrower if capped, left-aligned); 2–3 → one row, equal heights, widths by ratio filling the width (height cap 300); 4 → 2+2; 5 → 2+3; 6 → 3+3 (row height cap 260); more than 6 → last tile shows `+N`. Card height follows the content; no empty space, no cropping beyond the row fit.
- **Opening a gallery** (avatar/name/card header): the Viewing page scales to 0.95, defocuses and dims; the gallery page racks in and plays the Exposure entrance. A gallery page is the Exhibition layout parameterized by gallery (opener = their latest photo, their accent, their strips) with a top bar of back, `关注/已关注`, and `放映` (their photos only). Photos open Detail as everywhere else.
- Demo names on the canvas (Birdline, 五月花事, 夜行者, 山与人) are prototype data only.

## 暗房 Darkroom (canvas board H5)

- **Header:** 98 pt glass bar: Schola 24 `暗房`; avatar button right (opens the account sheet).
- **Upload stage (the hero):**
  - *Idle:* card with aperture icon, Schola 26 `冲洗新照片`, a one-line hint (select from library, or share from another app), and a full-width primary button `选择照片`.
  - *Select:* system photo picker (`PHPickerViewController`), multi-select.
  - *Review sheet* (inset 8, radius 47): Schola `审片 · N 张`; picked photos in a horizontal row at true ratios (150 pt tall) with an order badge — tap toggles inclusion and renumbers; tag chips from existing library tags (toggle); primary `开始冲洗 N 张`. Builds on `UploadReviewSheetView`.
  - *Developing:* the stage shows `冲洗中` + mono `done / total · 显影 NN%`; a 4-column grid of the uploading photos rendered as negatives that **develop** to positives as each upload progresses, a check pops on completion (AF-lock animation), and a 2 pt overall progress bar in the first photo's accent. Progress comes from `UploadCenter`. The Live Activity shows the same progress.
  - *Done:* `N 张已显影` + mono `已加入你的展览`; buttons `去展览看看` (switches to Exhibition) and `继续上传`.
  - The existing upload FAB on the old Photos tab is removed; the share extension path is unchanged.
- **Stats row:** three Schola numbers from real data: frame count, original size total (MB), camera bodies.
- **Quota warning** (when the existing Studio quota warning applies): a full-width row directly under the upload stage, in the destructive colour, linking to the plan page.
- **管理 group** (native grouped list rows: icon, title, mono detail, chevron): 图库 (count) → library grid with select mode; 回应 (`N 待审`) → existing comment moderation, empty state `没有待审的回应`; 数据; 同步; 站点 → existing site settings form (backend-driven schema) restyled; 域名 (shows the custom domain).
- **账号 group:** 工作区, 套餐 (existing plan/subscription page), 赞助 (StoreKit sponsorship, only where `supportsStoreKitSponsorship`), 账号设置 (existing account settings, which contain delete account), 清除缓存, 退出登录 (destructive colour).
- **Navigation:** sub-pages push from the right; the Darkroom page shifts left 30 %, defocuses ~4 pt and dims to 0.5 (custom push animator over `UINavigationController`, interactive edge-swipe back preserved).
- Data, Sync and Domain keep their current content; only the visual system changes.

## Tab bar

Three items: 展览 · 观展 · 暗房, text labels in SF Pro 13 over a 4 pt focus dot (accent of the current context). Switching tabs: the selection lands immediately; the outgoing page (a snapshot) defocuses (blur 10, scale 0.985, fade) while the incoming page racks in (blur 24→0, scale 1.06→1). A tap mid-switch cancels the running switch and starts the next one, so nothing blocks (a `UITabBarController` transition animator would drop that tap). Tab labels never blur; only the focus dot pops in, with a selection haptic. Tab bar hides for Detail, the review sheet and the account sheet. Built on `AfilmoryTabBarController`; whether this is a custom bar or a restyled `UITabBar` is the builder's call (it must keep VoiceOver tab semantics).

## Accessibility

- All new controls are real buttons with labels; icon-only buttons carry accessibility labels (`返回`, `更多`, `回应`, `分享`, `全屏`, `收起地图`, `放映`, `退出放映`).
- Dynamic Type: SF Pro text scales normally; Schola sizes scale through `UIFontMetrics`.
- Reduce Motion: see Motion. Reduce Transparency: glass falls back to opaque fills via `AdaptiveGlass`.
- Text contrast ≥ 4.5:1 for all text on the ground and raised surfaces; accents are clamped to ≥ 4.8:1.

## Delivery phases

Each phase ships behind no flag (the app is unreleased; change code in place) and must leave the app fully usable.

1. **Foundation:** colour and type tokens, font bundling (Schola + subset script and CJK subsets, `project.yml` resources + `UIAppFonts`), motion primitives (rack focus, defocus, AF lock, exposure, develop) with Reduce Motion fallbacks, accent extractor with unit tests, 3-tab shell with the new tab bar and tab transition, deep-link index updates, account settings moved to Darkroom.
2. **Exhibition + Detail:** opener, contact sheet with 日/月/年 and pinch, shared transitions, Detail sheet redesign, projection mode, ∞ map level with fly-in and full-screen map card.
3. **Viewing:** page-view segments with continuous indicator, rolls, galleries, mosaic layout, gallery page reusing the Exhibition module, visitor mode restyle.
4. **Darkroom:** upload stage with review sheet and develop animation wired to `UploadCenter`/Live Activity, grouped lists, sub-page push animator, Site accent switch, restyled sub-pages.

## Verification

- `pnpm --filter @afilmory/mobile native:test` green, with new unit tests for: CJK subset coverage of display strings, accent extraction (calibration photos above), time-of-day mapping, contact-sheet grouping/packing per level, mosaic row splitting and sizing, deep-link → tab mapping.
- Simulator verification per `apps/mobile/AGENTS.md` (Afilmory Local, `axe` for input, memory guard on) for each phase: screenshots of every state listed in this document, plus screen recordings of the entrance, a scale change, the ∞ fly-in, full-screen map, Detail open/close, segment swipe, gallery entry, and an upload developing.
- Reduce Motion and largest Dynamic Type size spot-checked on each new screen.

## Left to the builder

- Concrete UIKit structure (custom bar vs restyled `UITabBar`, compositional layout vs custom layout for strips, how blur is animated — a `UIViewPropertyAnimator` over `UIVisualEffectView`, Core Image, or Metal — as long as it holds frame rate and the fallback rules hold).
- Exact spring parameters within the stated durations.
- Map clustering thresholds and pin collision handling.
- Where the existing `Transition/` animators are extended versus replaced.

## Calls made during design (not explicitly confirmed by the owner)

- The opener is random on every cold launch (not once per day); the caption reads `开场`, not `今日开场`.
- Accent algorithm and its thresholds (above); fallback `#EDE9E3`.
- Projection interval 3.6 s.
- Darkroom sub-page set; the `强调色跟随照片` switch shown on the canvas is dropped (it would need a backend setting).
- Where the old Photos/Studio/profile features land (search & filters in the Exhibition top bar; plan, sponsorship, cache, delete account in Darkroom's 账号 group; quota warning under the upload stage).
- Detail keeps paging, zoom, Live Photo and drag-to-dismiss, with the sheet/gesture rules above.
- Location on someone else's photo opens their gallery page at ∞.
- Signed-out visitors see Viewing's 展厅 only.
- Reduce Motion fallbacks.

## Copy and localization

String Catalog keys stay English source text. English names (approved by the owner; Chinese is the design language; ja/ko/zh-Hant/zh-HK follow the usual translation pass):

| zh-Hans | English |
| --- | --- |
| 展览 / 观展 / 暗房 | Exhibition / Viewing / Darkroom |
| 印样 | Contact Sheet |
| 日 · 月 · 年 · ∞ | Day · Month · Year · ∞ |
| 开场 · 再曝光 | Opener · Re-expose |
| 放映 | Project |
| 新冲洗 · 展厅 | New Rolls · Galleries |
| 冲洗了 N 帧 | Developed N frames |
| 冲洗新照片 · 审片 · 开始冲洗 · 冲洗中 · N 张已显影 | Develop new photos · Review · Start developing · Developing · N developed |
| 深夜 清晨 上午 正午 午后 傍晚 夜晚 | Late night, Dawn, Morning, Noon, Afternoon, Dusk, Night |

## Open questions

None. (CJK serif: subset to the app's own strings, decided by the owner; English names: approved as listed.)

## Canvas index

All on https://claude.ai/artifact/VP9F8B8T6nkVSm4Ty5h1bj (Design canvas). Board files are `project/<name>.dc.html` on the canvas.

| Board | Status | What it decided |
| --- | --- | --- |
| A Main / B ContactSheet / C DepthWall | Round 1 history | A became projection mode; B became the contact sheet; C rejected |
| L1 Darkroom / L2 WhiteCube / L3 EdgeCode | Round 1 history | Dark ground + serif/mono pairing kept; red accent rejected; L2, L3 rejected |
| D1 Detail | Approved | Photo as page, two-detent sheet, data-driven header, concentric corners |
| D2 TypeSpecimen | Approved | Type roles (Schola, Source Han Serif, SF Pro, SF Mono) |
| K1–K3 / K4 | Approved K1–K3 | Photo-derived accent; pure monochrome rejected |
| H1 OpenerSheet | Approved | Opener + contact sheet, Detail flight, projection (focal-plane scroll later dropped) |
| H2 FilmStrips | Rejected | Horizontal per-day strips |
| H3 TabsMap | Approved | 3 tabs, 日·月·年·∞ scale, map fly-in, full-screen map card |
| H4 Viewing | Approved | Compact header, swipe pages, rolls, galleries, mosaic, gallery entry |
| H5 Darkroom | Approved | Upload-first darkroom, review sheet, develop animation, grouped lists |
