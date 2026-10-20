# iPhone Duo photo browsing

Approved in chat on 2026-10-20 after reviewing the `iphone-duo` Artboard.

## User decisions

1. The expanded gallery remains one full-width masonry (q1-a). It does not keep a photo preview beside the gallery.
2. Selecting a photo on the expanded display opens the q3 preview: photograph on the left page, its existing information on the right page, divided at the fold.
3. An icon-only Full Screen button enters immersive viewing. After reviewing the native implementation, the user requested Back and Full Screen in the right system vertical bar. The same Full Screen item becomes Exit Full Screen. Tapping the photograph does not enter full screen; localized titles and accessibility labels remain available.
4. Folding while previewing continues the same photo on the outer display (q2-a).

## Implementation calls

- Reuse `PhotoDetailViewController`, the paged viewer, existing EXIF view, and the masonry's resize anchoring. Preserve their social actions, owner actions, sharing, image loading, and transition handling.
- A system `UINavigationController` owns the detail navigation item outside `UIArrangementViewController`. The arrangement uses a horizontal split for photo/information preview, and an overlay containing only the photo for full screen or compact viewing. It handles fold geometry; application code does not calculate two pane frames from changing reserved-region rectangles.
- Hinge presence, regular width and landscape geometry select expanded preview. A temporarily missing division rectangle does not reset inspector progress during presentation. Do not identify a device by model or assume `.phone` means compact. New SDK APIs are guarded for iOS 18 compatibility.
- Keep sharing, information, comments and reactions in the existing photograph toolbar. They retain the existing presentation and interaction ownership. Back, Full Screen and the existing More navigation action participate in the system vertical bar.
- Inspector opacity follows the same opening and dismissal transition as the other chrome. Metadata and layout updates must respect an in-progress transition's opacity. Clear that override on successful presentation or cancelled dismissal.
- Enter the two-page preview automatically when space and a vertical fold allow it. Returning to a compact or tall window shows the photo without automatically opening a bottom information panel. Returning to the expanded window restores preview mode unless the user explicitly entered full screen.
- Full screen uses the existing viewer over the available display, with an explicit control to return to the two-page preview. Keep the current photo when switching. The regular phone's existing tap-to-hide-chrome behavior stays local to that layout.
- Full-screen entry and exit animate the current image's position, size and clipping viewport for 0.38 seconds using the existing photo transition image view. EXIF fades out on entry and back in on exit. Layout settles behind that image so collection-view resizing cannot interrupt the visual transition. Reversing starts from the currently presented image geometry; resizing or preparing dismissal finishes the handoff to the live viewer. Reduce Motion or a missing image uses the immediate state change.
- Keep the same detail controller, viewer and information view across resizing. Keep presented sheets and EXIF disclosure/scroll state. Closing the preview reveals the existing masonry at its preserved position.
- Account for asymmetric left/right safe areas independently in fixed controls. Media may extend behind safe areas; interactive controls must not.
- Use existing native semantic colors and adaptive glass. The app currently declares a dark interface; this work changes layout and interaction rather than its theme.
- In a regular wide window without a fold, retain the existing information-side-panel behavior. In tall or compact windows, retain the existing phone layout.

## Scope

The shared photo-browsing surface and masonry controls used by Photos, gallery detail and Studio library. No redesign of Map, Explore directory, Studio management, onboarding, or billing. No new dependency, device-model flag, app release, or publication.

## Artifact record

- Type: `artboard`; id: `iphone-duo`.
- Path: `.ryugi/artifacts/artboard/iphone-duo/canvas.json`.
- Approved boards: q1-a, q2-a, q3; the repeated `flow-*` boards show the approved sequence.
- The `browse` page preserves earlier design rounds. The `native` page is the authoritative current layout and shows Back/Full Screen in the system vertical bar. The artifact may stay uncommitted; all decisions are recorded above.

## Checks

- Regression tests exercise preview entry, explicit full screen alongside owner actions, compact/expanded changes, safe-area geometry, single/two-line title padding, and retaining the current photo rather than resetting to the initially selected one.
- Build and run the native XCTest suite with the installed Xcode 27.1 SDK.
- Render the real detail view on the Duo simulator, inspect the photo/information split and accessible Full Screen control, and exercise its state changes.
- Check the existing phone layout through compact-window tests. Record any posture change that the available Simulator CLI cannot perform as unverified rather than claiming physical fold coverage.
- Run the repository's Simulator memory guard throughout native verification.

## Verification result

- Built and tested on Xcode 27.1 (27A9275), iOS 27.1, Duo simulator `3AC87F15-6078-46E6-A6D8-82513CDC318F`, Local variant.
- Baseline: 285 passed, 0 failed, 1 skipped. Final: 299 passed, 0 failed, 1 skipped. The unchanged skip is `LocalizedFormatTests.testInterpolatedLiteralsResolveAgainstTheCatalog`, which requires a non-English run.
- Fourteen new tests exercise actual UIKit views and actions, including a paged photo different from the initial selection, compact/expanded resize, asymmetric safe areas, owner actions alongside the full-screen symbol, image-failure feedback, single/two-line title padding, system navigation/arrangement ownership, and social actions after full screen.
- Full-screen animation tests sample real image presentation geometry every 25ms in both directions. A cropped landscape fixture must move and resize through intermediate frames while keeping a 3:2 aspect ratio; EXIF must pass through partial opacity on return. Another test reverses after 80ms and checks continuity and final photo identity. Resizing and preparing dismissal during animation must restore the live photo.
- The opacity regression first failed with EXIF alpha 1 when presentation chrome requested 0. It now checks 0 and 0.5 across layout passes, and 1 on completion. A real animated presentation from a thumbnail samples presentation-layer opacity every 30ms: it must increase monotonically and keep the visible inspector column's position and width unchanged.
- The title regression reproduced a 21.3pt capsule: an unattached `UIView` returned zero layout margins. The shared capsule now uses explicit padding, a 44pt minimum height, and refreshes its frame when its title or subtitle changes.
- Native `simctl` video and extracted preview/full-screen frames are retained under `.ryugi/artifacts/artboard/iphone-duo/pages/native/`, alongside the result summary, build log and memory log. The Artboard's `native` page displays those frames. Actions in this capture were driven by XCTest, not Simulator HID taps.
- `fullscreen-motion.mp4` is an unretimed clip of the recorded full-screen entry/exit; `verification.mov` retains its complete source recording.
- The repository's Simulator memory guard remained active throughout verification and stayed below its configured limit.
- Core, Postgres, Redis and local object storage are running; the local Duo Gallery has 10 photos. Directory, manifest and original/thumbnail endpoints return success. After the final test run, the latest Local app was relaunched and its loaded gallery thumbnails were visually checked in Device Hub.
- Remaining manual checks: physical fold/half-fold, folding with a presented sheet, and Simulator HID gestures. Tests resize the same real view but do not prove physical posture transitions. AXe cannot correctly target Duo's inner display here; recorded actions come from XCTest rather than successful HID taps.

## Platform references

- [Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo) places navigation outside arrangements and prioritizes hardware-edge controls.
- [UIKit adaptation Tech Talk](https://developer.apple.com/videos/play/tech-talks/111462/) explains that standalone navigation bars do not participate in the vertical bar.
- Confirmed against the installed iOS 27.1 SDK: `UIArrangementViewController.h`, `UIHingeInteraction.h`, `UIBarButtonItem.h`, `UIViewController.h`, and the UIKit Swift interface for split/overlay arrangements.
