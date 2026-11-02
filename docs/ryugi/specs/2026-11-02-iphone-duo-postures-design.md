# iPhone Duo: vertical bar, focus rail and posture layouts

Approved board decisions on 2026-11-02 (artboard `iphone-duo`, page `vbar`, rounds 1–5). Supersedes the two 2026-10-20 Duo specs, whose code the November redesign (`8c30439c`) deleted.

## Why

The November redesign (Exhibition / Viewing / Darkroom) replaced the system tab bar with our own `AFFocusTabBar` and hides every navigation bar. On iPhone Duo that breaks two things:

1. The system puts the `UITabBarController` tab bar and navigation bar items into the **UIVerticalBar** on the hardware edge. Our tab bar is hidden and our navigation bars are hidden, so the vertical bar shows only the status bar.
2. Our own header buttons ignore the vertical bar's safe area. On the outer display the Exhibition "Project" button and the photo card already sit under the vertical status bar.

The inner display today is the phone layout stretched to 951pt. The device also has two open postures, and each needs its own layout:

- **Book**: half-open, held like a book.
- **Flat**: fully open.

## Goals

- Page buttons live in the system vertical bar on any Duo display.
- The three tabs remain our own focus bar, drawn vertically on Duo.
- Each of these screens gets a closed, book and flat layout: Photo detail, Exhibition contact sheet, Viewing, Darkroom home and its subpages.
- Changing posture keeps the current photo, scroll position, selection and open state.

## Non-goals

- Ordinary iPhone layouts. No visual change.
- AFSheet, sign-in, intro, post-setup, quota wall and subscription screens. They keep their current layouts on Duo, even if they cross the fold in book posture. This is a follow-up spec.
- The projection (slideshow) screen and the full-screen map.
- New features or new content. Every module shown already exists on the phone.
- iOS 26 fallbacks for the Duo APIs. They simply don't run below 27.1.

## Anti-goals

- In book posture, an image, a date strip or a line of text crossing the fold. The one exception is Photo detail full screen.
- Hand-placed copies of system controls drawn into the vertical bar.
- Identifying the device by model name, or computing pane frames from magic numbers. Read geometry from the hinge, safe areas and reserved regions.
- Compatibility shims or feature flags. The app is unreleased.

## Platform facts (iOS 27.2 SDK headers + spike on the Duo simulator)

The vertical bar hosts exactly three things: the status bar, a `UITabBarController` tab bar, and `UINavigationController` navigation items. There is no custom-view API.

Spike results on the outer display, recorded on the artboard as `sp-hidden`, `sp-visible` and `sp-clear`:

1. Navigation bar **hidden**: bar items do not reach the vertical bar.
2. Navigation bar **visible**, with a title: items reach the vertical bar, but a horizontal title band remains. The top safe area becomes 82pt.
3. Navigation bar **visible, no title, transparent appearance**: items reach the vertical bar, and the top safe area is only 24pt. **This is the approach.**
4. The vertical bar strip is 84pt wide on the outer display (466×678). The status occupies roughly the top 174pt of the strip. Occlusion `reservedRegions` reported (399.7, 29.3, 37, 37) and (382, 0, 84, 174).
5. A view we draw in the lower part of that strip receives touches.
6. Taps on vertical bar items reach our handlers.

APIs used, all `API_AVAILABLE(ios(27.1))`, so every use needs `#available(iOS 27.1, *)` because the deployment target is 26.0:

- `traitCollection.verticalBarEdge` (`.unspecified` / `.leading` / `.trailing`).
- `UIBarButtonItem.axisBehavior = .verticalPreferred` and `visibilityPriority`.
- `UINavigationItem.verticalBarCompressionBehavior`.
- `UIViewController.preferredVerticalBarBehavior` and `setNeedsUpdateOfVerticalBarConfiguration()`.
- `UIView.reservedRegions(kind: .occlusion / .division, options:)`.
- `UIHingeInteraction`, which reports `UIHinge.status` (`.closed`, `.partiallyOpen`, `.fullyOpen`, `.unknown`) and `angle`.

## Postures

| Posture | Condition | Layout rule |
| --- | --- | --- |
| Phone / closed | No vertical bar, or the hinge is `.closed` (outer display) | Phone layout. On the outer display, page buttons go to the vertical bar and content respects its safe area. |
| Book | Hinge `.partiallyOpen` and a `.division` region exists | Two pages split at the division rect. Each page is its own column. Nothing crosses the fold except Photo detail full screen. |
| Flat | Hinge `.fullyOpen` (or `.unknown`) on the inner display | One canvas. The fold is not a boundary. Columns split by content: main ≈ 2/3, secondary ≈ 1/3. |

Resolve posture in one place, `DuoPosture.resolve(hingeStatus:division:size:)`, and expose it to every view controller through a custom `UITraitDefinition` set via `traitOverrides` on the tab controller. Screens react to trait changes; nothing polls the hinge.

`.unknown` with a division present falls back to book. My call: don't let unknown readings split content wrongly.

## System vertical bar

When `verticalBarEdge != .unspecified`, every `UINavigationController` in the app does three things:

- Shows its navigation bar, untitled, with a transparent appearance (no background, no shadow) and an empty title view.
- Puts the screen's page buttons into `navigationItem` as `UIBarButtonItem`s with `axisBehavior = .verticalPreferred`.
- Hides the duplicate buttons in our own header views. Titles, segments and other content stay in content.

On phones (`.unspecified`) nothing changes. Navigation bars stay hidden and buttons stay in our headers.

Page buttons per screen (user-confirmed):

| Screen | Vertical bar items |
| --- | --- |
| Exhibition (own gallery) | Search, Project |
| Exhibition (visiting another gallery) | Back, Follow, Search, Project. My call: Follow becomes an icon item; its title stays as the accessibility label. |
| Viewing | Sign in (visitors only). No Search item: search stays the in-content field on the Galleries page (user decision after the builder check). |
| Darkroom home | Account avatar (closed and book postures only; in flat it moves into the sidebar). |
| Darkroom subpage | Back. My call: Library's Select/Done stays in its in-content header next to the frame count (it is not a page button today); no filter is added. In flat posture the subpage is the detail column and has no vertical bar items. |
| Photo detail | Back, Full Screen (book and flat only), More |

`PhotoDetailViewController` is presented modally with a custom transition, so it has no navigation item that reaches the bar. On Duo, present it inside a `UINavigationController` configured as above. The custom transition and the interactive dismissal must stay as they are. Whether to wrap it on phones too is the builder's call.

Avatar item: a `customView` may not render in the vertical bar. Test it first. If it doesn't render, use an image item made from the avatar with `.alwaysOriginal` rendering.

## Focus rail (our tabs)

Board decisions vb1 → B and vb2 → C.

- On Duo, `AFFocusTabBar` renders vertically, in the same edge strip as the system vertical bar, in the space **below** the system items. Labels are stacked vertically (`writing-mode` style). The active tab gets the existing accent dot.
- Its frame comes from the vertical bar edge's safe-area inset (strip width) and the occlusion reserved region (the rail starts below the occluded rect's maxY plus spacing). Mirror it when `verticalBarEdge == .leading`.
- Before building the rail, confirm that the occlusion region grows when bar items are present. If it doesn't, use the lower half of the strip and record this as a ruling.
- The show and hide rules match the phone: hidden on Darkroom subpages and under modals, exactly as `setFocusBarHidden` works today.
- Content safe area excludes the strip on that edge. The rail does not add its own inset beyond the strip.
- On phones the bar stays horizontal at the bottom, unchanged.

## Screen layouts

Inner display reference size: 951×669, with the vertical bar on the trailing edge. Board geometry: fold at x≈475; content ends at the strip.

### Photo detail (vb3, vb4-b, vb8)

- **Closed**: phone layout (photo, chips bar, bottom sheet), with Back and More in the vertical bar. Folding while in detail keeps the current photo; this repeats the October decision.
- **Book**:
  - Left page: the photo, aspect-fit, plus the existing chips bar (No. pill, React, Share) at the bottom of the left page.
  - Right page: `DetailInfoColumn`, drawn like vb3-a / vb8 rather than the phone sheet: no card, accent dot + "No. NN", serif title, mono date · time · place · camera line, tags, exposure values with their own labels (3 columns at ≥ 360 pt, 2 below), tone, the remaining sheet sections, then location and comments rows. Scrollable; no grabber or collapse. (Changed at verification, user call.)
- **Flat**: the photo column takes ≈ 2/3. The info column is ≈ 1/3 (about 272pt at 951 wide), and the exposure grid drops from 3 columns to 2.
- **Comments in book and flat** (vb4-b): tapping the comments row replaces the info column with `PhotoCommentsSheetView` in its flat style (vb4-B: avatar, name · time, plain text, like / Reply row; title "Comments · N"), plus an accent "‹ Info" text control that returns to the info column. No AFSheet. On phones and the outer display, comments keep using the AFSheet.
- **Full Screen** (book and flat): the Full Screen item expands the photo over the whole content area and fades out the chips and info. The same item becomes Exit Full Screen. Horizontal paging still works. Tapping the photo does not toggle full screen.
- Paging to another photo keeps the info column in sync.
- Folding to closed (my call): Full Screen exits; an open comments column returns to the info view and the phone layout shows its collapsed sheet. The `CommentsStore` is not carried into an AFSheet.

### Exhibition contact sheet (vb5-b, vb9)

- **Closed / phone**: unchanged.
- **Book**: each page is one lane.
  - `ContactSheetLayout.pack` runs per lane width.
  - Rows alternate, left lane row then right lane row, top to bottom. Reading order is left row → right row → next.
  - A date strip never crosses the fold.
  - My call: a year divider spans both lanes as one row, with its text on the left page.
- **Flat**: one full-width pack (the same algorithm as the phone, at the wider width). Strips may cross the centre line.
- The `∞` map level stays full width in both postures. My call: it is media, as in the October map decision.
- The opener/hero at the top of Exhibition was not drawn. My call:
  - Book: the opener photo stays inside the left page, and its kicker, number and metadata sit on the right page.
  - Flat: full width, as on the phone.
- Scroll position: across posture changes, keep the photo at the top of the viewport visible (anchor by photo ID, not by offset).

### Viewing (vb5-c, vb10)

The real page has two segments, **New Rolls** and **Galleries** (`ViewingPage`); the boards' 关注 / 时间线 / 发现 labels were wrong, the column rule is what was approved.

- **Book**: both segments lay their cards out in 2 columns, one per page (New Rolls `ViewingRollCell`, Galleries `ViewingGalleryCell`; Following/Discover stay sections inside Galleries).
- **Flat**: 3 columns for both segments.
- The segment header and the Galleries search field stay in content; only visitor Sign in moves to the vertical bar.

### Darkroom (vb6, vb7-a, vb11)

- **Book, home** (vb6): two pages.
  - Left page: what is happening — the stage (develop new photos and upload progress), quota and stats.
  - Right page: where to go — the Manage and Account groups.
- **Book, subpages** (vb7-a): pushed full screen, as on the phone. The Library grid uses one lane per page (column count chosen per lane width; the board shows 4 and 3), and no thumbnail crosses the fold.
- **Flat** (vb11, modelled on iOS Settings on Duo): a two-column split.
  - Sidebar, ≈ 1/3 of the width:
    - An account card at the top: avatar, workspace name and plan. Tapping it opens the existing workspace switch menu.
    - The "Darkroom" group, in order: Stage, Library, Replies, Data, Sync, Site, Domain.
    - The "Account" group with the existing account rows: Plan, Sponsor, Account settings, Clear cache, Sign out.
    - Row badges come from the existing row details (count, pending).
  - Detail column, ≈ 2/3, shows the selected item:
    - "Stage" is selected by default and shows the stage, quota and stats.
    - Selecting a row replaces the detail column in place; there is no push.
    - Rows that today open a menu, alert or sheet (workspace, sponsor, clear cache, sign out) keep that behaviour and don't change the selection.
  - The avatar is not in the vertical bar in flat posture.
- **Posture changes**:
  - Flat → book with a non-Stage selection: home is shown with that subpage pushed on top.
  - Book → flat with a subpage pushed: that subpage becomes the selected detail column.

## Visual direction (keep)

- Keep the existing darkroom language: `AFColor` ground / raised / fill / tick, the Schola / Han Serif exhibit type for titles and numbers, mono for metadata, the accent dot for selection, and the existing `AFGlassButton` look for in-content controls.
- The fold is never decorated; content simply avoids it in book posture.
- Book posture reads like a printed spread: two pages, each a complete column.
- Flat posture reads like one sheet, with a main and a secondary column.
- No new imagery, icons or copy beyond one "‹ Info" control label, plus localized accessibility labels for the new items (Full Screen / Exit Full Screen; Follow, if it becomes icon-only).

## Constraints

- Swift 6, UIKit, iOS 26 deployment target. Duo APIs are behind `#available(iOS 27.1, *)`.
- No file over 500 lines. Split by posture, not by device.
- No comments except for platform quirks: the spike's hidden-navigation-bar finding is worth one line.
- Add localized strings to `Localizable.xcstrings`.
- Tests stay green: the current suite has 528 tests, 1 skipped, 0 failures.
- Phone layouts are pixel-identical. The UI catalog on iPhone 17 Pro and SE must not change.

## Left to the builder

- Where posture resolution lives, how the custom trait is named, and how each screen swaps layouts. Re-layout of the same views is preferred over rebuilding controllers, so that state survives.
- Whether to use `UIArrangementViewController` / `UISplitArrangement` for the detail and Darkroom splits or plain Auto Layout. Either way, geometry comes from the division rect (book) or proportions (flat). The deleted October implementation (`git show 8c30439c^:apps/mobile/Afilmory/Features/Detail/PhotoDetailInspectorPresenter.swift`) is a reference for the arrangement API and fold handling.
- Lane column counts for the Library and Viewing grids at each width.
- Animation of posture changes: use the existing spring motion, and keep anchors (current photo, top-visible item, selection) stable.

## Artifacts

- **Artboard** `iphone-duo`, path `.ryugi/artifacts/artboard/iphone-duo/`, page `vbar`. Link: https://ryugi.innei.dev/a/31bNjSvgP5CogjdFm37gg?page=vbar
- **Round 1, vb1 → B**: our own vertical focus rail for tabs. The system vertical bar stays on for status and page buttons.
- **Round 2, vb2 → C**: the rail sits in the lower part of the same edge strip as the system bar.
- **Spike** (`sp-*`): a transparent, untitled, visible navigation bar puts items into the vertical bar with a 24pt top inset.
- **Round 3**: vb3 two-page detail plus full screen; vb4 → B, comments replace the info page; vb5 → B, contact sheet one lane per page; vb5-c, Viewing one column per page.
- **Round 4**: vb6 Darkroom home book layout; vb7 → A, subpages pushed full screen in book posture.
- **Round 5**:
  - Book vs flat for each screen (vb8 detail, vb9 contact sheet, vb10 Viewing), accepted.
  - vb11 Darkroom flat, version 2: a sidebar plus detail split modelled on iOS Settings. The user rejected version 1 (three columns) because the left took too much space.
- **Earlier rounds** on pages `browse`, `native` and `tabs` record the October decisions, which this spec carries over where they still apply: fold keeps the current photo; the map stays full size.

## Verification

- Unit tests (XCTest, real UIKit views where possible):
  - posture resolution;
  - lane packing never crossing the division;
  - flat and book column geometry;
  - vertical bar items per screen and per state (visitor, visiting gallery, flat Darkroom without the avatar);
  - posture-change state mapping in Darkroom;
  - detail comment column swap and return;
  - the full-screen toggle title and state.
- Duo simulator:
  - Outer display screenshots for each tab and for detail. Use `xcrun simctl io <udid> screenshot --display=1`. The Duo is `E049AB4A-D2F0-47AE-AD8C-289B07E6D3EE`, iOS 27.2.
  - The inner display needs the user to unfold the simulator once from the Simulator menu. If the simulator can't produce book posture, verify book layouts through trait overrides in tests, and report that physical posture is unverified.
- Phone regression: run the UI catalog on iPhone 17 Pro and SE (`scripts/ui-catalog.sh`), with no visual change.
- Use ryugi:verifying-ui: one verify group per screen, approved board versus a real screenshot, on the `iphone-duo` artboard.
