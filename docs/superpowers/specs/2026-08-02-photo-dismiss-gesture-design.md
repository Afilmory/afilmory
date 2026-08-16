# Mobile Photo Viewer — Photos-Style Symmetric Photo Transition — Design

**Date:** 2026-08-02
**Scope:** Opening and closing are the same photo-only transition in opposite directions. The masonry page remains geometrically fixed; only the selected photo translates and scales. The black backdrop is a fixed, full-bleed layer that changes opacity, and detail chrome enters after the photo has established the transition.
**Touches:** `apps/mobile/modules/photo-masonry/ios/Core/PhotoTransitionRegistry.swift`, `Detail/PhotoDetailView.swift`, `Detail/PhotoDetailChromeVisibility.swift`, `Viewer/PhotoViewerView.swift`, `Viewer/PhotoViewerCell.swift`, `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/modules/photo-viewer/PhotoDetailScreen.tsx`.

> **Partly superseded by `2026-08-03-photo-transition-native-rebuild-design.md`.** Rows 16, 17, 21, 23 and 27 of the decision table below — the animation-less route transition, the opening window snapshot, the absent system interactive dismiss, the painted placeholder slot and the presenter handoff — exist only to survive React driving the navigation. Once the detail view controller is presented natively they are deleted and replaced by standard UIKit custom transitions with a live presenter. Every other row, including all of the visual design and the commit rule, still holds.

> **Gesture amendment (2026-08-16).** A downward one-finger drag may begin at any zoom scale and preserves the current zoomed crop during the transition. Pinch-to-dismiss is instead gated by the zoom scale at the beginning of each pinch gesture. A gesture that begins above fit may only return the image to fit; the user must release and begin a new inward pinch from fit before interactive dismissal can start. This explicit boundary prevents the inner zoom and outer dismissal transforms from producing a visible alignment discontinuity.

## Problem

The iOS 18+ zoom transition treats the complete `RNSScreen` as the shared element. On opening it scales the entire destination view from the thumbnail, including backdrop and chrome; on interactive dismissal it shrinks the same complete page. This cannot express the Photos behavior: the presenter remains stationary, the selected photo alone moves between source and fullscreen geometry, and the backdrop only cross-fades. The route transition and the visual photo transition therefore require separate ownership.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Transition symmetry | Opening and closing use the same source/fullscreen geometry and transform calculation in opposite directions |
| Route transition | Animation-less in both directions (`preferredTransition = nil`, `stackAnimation = .none`); route state changes underneath the native visual handoff |
| Opening snapshot | Capture the complete presenter synchronously at press time and retain it above the window until `PhotoDetailView` is ready, preventing navigation or React mounting from exposing an intermediate screen |
| Opening photo | Reuse the already-decoded source-cell image as the viewer placeholder, then animate only `mediaViewport` from source geometry to identity |
| Opening choreography | Backdrop remains full-bleed and fades 0→1 independently; detail chrome appears only during the final 0.16s of the photo's 0.42s spring |
| Interactive tracking | Own one-finger pan and a pinch-dismiss recognizer on `PhotoDetailView`. A pinch gesture may participate in dismissal only when it begins at fit; a pinch that begins zoomed remains exclusively owned by the current cell's `UIScrollView` until all touches end. Both dismissal inputs transform **only** `mediaViewport` |
| System interactive dismiss | Absent because the route has no zoom transition; the local detail pan is the only interactive dismiss owner |
| Backdrop | Single full-bleed black `backgroundView` at the bottom of `PhotoDetailView`; alpha = 1 − progress during the drag, never transformed |
| Grid placeholder | The masonry keeps a blank slot where the previewed photo came from — painted onto the presenter snapshot at capture time from the same rect the commit animation targets |
| Chrome fade | Instant (~0.15s ease-out) on gesture begin via `PhotoDetailChromeVisibility.dismissing` |
| Commit rule | Pan: progress > 0.45 (of 340 pt), or downward velocity > 1200 pt/s with ≥100 pt travelled. Pinch: scale/centroid progress > 0.45, or inward velocity < −1.25 while scale < 0.92. Anything less springs back |
| Commit animation | Photo flies into the blank slot with a projected release-velocity spring (0.26–0.42s); masonry cells preserve aspect ratio so the aspect-fit rect maps exactly onto the cell. If the pager moved to another photo, fall back to drifting out along the gesture while fading |
| Presenter handoff | At landing, atomically replace the moving photo with the complete frozen grid, then retain that snapshot above the `RNScreens` hierarchy until the live presenter has rendered stably. A source-cell replica bridges the final compositor commit before removal |
| Snapshot release | Clear the snapshot's opaque black backing atomically before cross-fading its grid content. Never fade the backing and content together, which creates a transient full-screen luminance dip |
| Cancel | Project release velocity into the return spring; restore the backdrop with a short ease and delay chrome restoration into the settling phase so these layers do not race the image |

## Architecture

### Backdrop consolidation

The black backdrop previously lived on four stacked views (`PhotoDetailView`, `mediaViewport`, `viewer`, `collectionView`) plus cell layers and two JS layers. All become clear; one black `backgroundView` sits at the bottom of `PhotoDetailView`'s subview stack. The JS side (`PhotoDetailScreen` root, the route's `contentStyle`) is transparent so the masonry grid actually shows through once the backdrop fades. `PhotoViewerView` has no standalone JS consumers, so clearing its background is safe.

### Opening transition (`PhotoTransitionRegistry` → `PhotoDetailView`)

The source tap creates a transition session before React pushes the detail route. The registry captures the host window synchronously, records the source-cell frame and decoded thumbnail, and places the frozen presenter above the window. When the detail view has a transition ID, a window, valid bounds and a laid-out current image, it claims that snapshot and performs the inverse of the close transform.

- **Initial state:** frozen masonry is visible; its source slot is covered; `mediaViewport` is transformed onto that slot; backdrop and detail chrome have alpha 0.
- **Photo phase:** spring `mediaViewport.transform` to identity over 0.42s. The frozen masonry does not translate or scale.
- **Backdrop phase:** animate the fixed `backgroundView.alpha` from 0 to 1 over 0.24s.
- **Chrome phase:** delay navigation and toolbar appearance until the final 0.16s.
- **Handoff:** after the photo reaches identity, remove the frozen presenter and expose the live detail hierarchy in the same state.
- **Fallback:** if no valid transition session exists, reveal the detail view without a shared-element animation. Reduce Motion also applies the final values directly.

### Interactive dismissal (`PhotoDetailView`)

`dismissPanGestureRecognizer` begins when: `interactiveDismissEnabled`, inspector closed (`progress ≤ 0.001`), no Live Photo hold, vertical dominance (|dy| > |dx| × 1.12), and downward. Zoom is deliberately not a gate. The pager and each zooming scroll view's pan require the dismiss pan to fail, so a downward drag dismisses while other directions retain their existing pan behavior.

`PhotoTransitionInteraction` installs a non-cancelling pinch-dismiss recognizer on `PhotoDetailView` and permits simultaneous recognition only with another pinch recognizer. Eligibility is resolved once when the recognizer attempts to begin. If the current cell is above its minimum zoom scale, the dismiss recognizer fails for that complete touch sequence while `UIScrollView` remains the sole visual zoom owner. Reaching fit does not reactivate it. After the touches end, a fresh inward pinch beginning at fit may drive the outer interactive dismissal. The outer scale is anchored at the gesture centroid and includes later centroid translation.

- **began:** For pan, dismissal begins immediately. For pinch, dismissal begins only after an eligible gesture that started at fit crosses below fit. `visibility.dismissing = true`; chrome fades in 0.15s; reaction rail closes.
- **changed (pan):** `mediaViewport.transform = translate(tx, ty·rubberBandIfUpward) → scale(1 − 0.32·progress)`; `backgroundView.alpha = 1 − progress`. A zoomed image remains zoomed and cropped inside the transformed viewport.
- **changed (pinch):** scale the viewport from 1 toward 0.48 around the handoff centroid and add centroid movement. Progress is the greater of inward-scale progress and downward-centroid progress; `backgroundView.alpha = 1 − progress`.
- **layout:** `layoutSubviews` skips `inspector.reapplyProgress()` while dismissing — frame writes under a transform are undefined.
- **ended, commit:** project the release velocity toward the target slot and spring the viewport from its current transformed state into that slot. At landing, reveal the slot in the frozen presenter, hide the moving viewport in the same transaction, and request an animation-less route pop. The frozen presenter is promoted to the host `UIWindow` during the pop so `RNScreens` child reordering cannot expose an empty container; it is released only after the live presenter is stable.
- **ended, cancel:** project the release velocity toward identity, spring only the viewport transform, ease the backdrop independently to 1, and restore chrome after a short phase delay (respects `userHidden` / `zoomed`). Reduce Motion applies values directly.

### Findings that shaped this (from the debugging pass)

- The system zoom dismiss installs `_UIContentSwipeDismissGestureRecognizer` / `_UITransformGestureRecognizer` on the `RNSScreenView`, and the transparent regions of the scaled screen do reveal the presenter beneath — but the machinery only ever scales the whole screen, so it cannot express "image only".
- `transitionCoordinator` does not exist yet when `interactiveDismissShouldBegin` runs; it appears several frames later. Moot now that the drag is owned locally.
- axe's `swipe` HID synthesis never triggers the system dismiss pan; `axe drag` (explicit touch-move stream) does. Local `UIPanGestureRecognizer`s respond to both.
- Removing the frozen presenter when `PhotoDetailView.window` became `nil` exposed an approximately 96ms interval before the React route's presenter was rendered, producing the intermittent whole-screen flash. Window-level snapshot ownership closes that interval.
- RNScreens can report the presenter attached before the final Core Animation layer tree is visibly committed. The destination-cell replica bridges that compositor handoff and prevents a one-frame empty source slot.
- Starting the opening transition from ThumbHash exposed several visibly soft frames even when geometry was correct. Injecting the source cell's decoded image into the viewer makes the visual element continuous from the first frame.

## Edge cases

- **Info panel open:** inspector owns vertical pans; the dismiss pan refuses (`progress ≤ 0.001` gate).
- **Zoomed image:** downward pan is accepted. The transition target is derived from the current transformed image frame, preserving the visible crop instead of jumping to fit at gesture begin.
- **Live Photo hold:** refused by the begin gate so playback and dismissal do not compete.
- **Immersive mode:** chrome alphas already 0; `dismissing` is a no-op on top; cancel restores the `userHidden` state.
- **Horizontal paging:** unchanged — vertical-dominant drags never begin the pager pan, and the pager requires the dismiss pan to fail.

## Verification

On the simulator, verify these paths:

1. Open from the grid — grid/header/tab-bar geometry remains fixed; the selected photo stays sharp while expanding; backdrop fades independently; detail chrome enters late.
2. Slow drag down — chrome disappears immediately, backdrop stays full-bleed and dissolves with progress, only the photo translates/scales with the finger, grid visible behind.
3. Release early — cancel: photo springs back, backdrop and chrome fade back in, immersive state preserved.
4. Long/fast drag — commit: photo continues from the release velocity into its thumbnail, then the frozen presenter hands off to the live grid without a black frame or black source cell.
5. Tap Back — use the same photo-only close path, finish the route pop, and allow the same source photo to open again immediately.
6. Repeat open/close cycles and inspect the recording for any full-screen luminance dip.
7. Zoom in, pan the image away from center, then drag downward with one finger — dismissal begins without resetting to fit; early release cancels and a committed release lands in the source cell.
8. From fit, pinch inward — crossing below fit continues as an image-only dismissal around the fingers. Repeat from a zoomed state and verify the first gesture stops at fit without dismissal; release, then begin a second inward pinch from fit and verify that only this new gesture can dismiss.

Run `pnpm --filter @afilmory/mobile native:test` and `pnpm --filter @afilmory/mobile ios:local` after native changes.
