# Signed-in tabs on iPhone Duo

Approved in chat on 2026-10-20: implement q4–q7 from the `iphone-duo` Artboard.

- Map: keep the map full size; place interactive overlays within the current horizontal safe area, including when system controls are on the left.
- Explore: keep the existing three segments and two-column gallery directory. In regular width, the segment/search header belongs to the content area, while Search/Close remain native navigation actions. The pager and its cards must avoid the vertical system bar. Compact width retains its existing navigation header.
- Comments: show one empty state when the current filter has no results. With results, preserve separate list and detail panels with a 16pt gap, as clarified by the user's annotated screenshot. Preserve selection, filtering, pagination and deletion confirmation.
- Studio: show existing workspace/plan/overview and management/operations sections side by side in regular landscape width. Keep the compact single-column order, existing route pushes, workspace switching, loading/error states, refresh and sign-out.

Use native semantic colors and existing controls. Preserve the previous photo viewer work and unrelated `photos` submodule edits. Work continues in the current checkout; no publishing or commits are requested.

Verification: behavioral UIKit geometry/search tests first; then actual local-account checks for all four tabs, comments with and without results, Studio routes, and compact resizing. Keep the Simulator memory guard running. Capture native frames and update the Artboard; report physical posture and HID limits explicitly.

## Verification result

- Xcode 27.1 / iOS 27.1 / Duo expanded landscape, `app.afilmory.local`, actual local `duo-review` owner session.
- The initial regression run failed on the expected defects: map button right edge 939 exceeded the content safe edge; Explore pager ignored the horizontal safe area; activating search removed the input from the window.
- The local-service regression checks failed before the Studio/comments changes: management was still in the left column below the fold, and the comment panels had only 0.33pt separation. Both passed after implementation.
- Final native geometry: Map fit `(811, 541, 44, 44)` avoids the Tab bar `(882, 0, 69, 669)`; Explore cards are `(20, 100, 405, 220)` and `(442, 100, 405, 220)`; search input remains visible and filters to one gallery. Comment panels are separated by exactly 16.0pt, and the empty-state accessibility tree contains one `No comments` label.
- All six existing Studio routes opened against the real local backend. The first `studio-restored` screenshot was incorrectly labeled as restored two-column: the capture driver assigned `.unspecified`, leaving an explicit override and a one-column view. That screenshot is retained with a corrected label. A new run on the same signed-in page removed the override with `traitOverrides.remove(UITraitHorizontalSizeClass.self)` and verified initial two-column → compact one-column → inherited regular two-column. The restored native frame and geometry were inspected: panels are 475.67pt / 475.33pt wide, and Photo Library is visible in the right column. This required a capture-driver correction, not a product layout change, and is not a physical fold test.
- Full native suite after the correction: 303 passed, 0 failed, 1 unchanged locale-dependent skip. Four permanent behavior tests cover horizontal safe areas, live search input and Studio compact/regular restoration, including inheriting regular width after removing the compact override. The corrected capture run passed all five checks; the original mistaken restoration was reproduced as a failing test. External-service capture drivers are archived with evidence, outside the permanent test target.
- Native evidence is retained in `.ryugi/artifacts/artboard/iphone-duo/pages/tabs-implemented/` and the correction in `pages/studio-restoration/`; earlier design rounds and before-state screenshots remain intact. Simulator memory guard stayed running.
- Physical half-fold/closed poses and HID gestures remain unverified. No destructive or billing actions were executed; temporary comment-status changes only touched seeded local comments and were restored.

The acceptance upload failed after several minutes with an HTML response where JSON was expected. History inspection confirmed that round 3 (`ffedb2ba-6558-40c7-9633-72674c4d7f9c`) was created, but its report was not published. The structured report and cited assets remain in `/tmp/afilmory-duo-tabs-acceptance/publish/`; complete product evidence is retained in the Artboard.

## iPhone 18 Pro regression check

On 2026-10-20 the current source was built and tested on iPhone 18 Pro, iOS 27.0 (24A434), 402×874pt. Six UI checks passed using the real local `duo-review` session and AXe HID: photo grid/open/return, bottom EXIF panel and immersive controls, map preview/reset safe areas, all three Explore segments plus typed search, the single-column Studio home and all six management routes, and populated/empty compact comments. Native screenshots were inspected individually; no regression from the Duo changes was found in these checked states. No product code was changed for this verification.

The native suite passed 291 tests with zero failures and 13 conditional skips for fold/landscape/locale requirements. Evidence is archived in `pages/phone/` on the existing Artboard; the phone acceptance was fully published as round 4 (`ef016133-1270-4772-b775-aec9f5181874`), covering all 6 criteria with 22 evidence attachments. This does not change the incomplete publication status of round 3. Scope was portrait, English, default text size and dark appearance; landscape, large text, physical-device performance and exact animation timing were not checked. Temporary session-transfer files and test drivers were removed; the Simulator memory guard remained active. No settings were saved, comments modified, purchases made or synchronization triggered.
