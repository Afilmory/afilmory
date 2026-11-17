# DESIGN.md — Afilmory Web Design System

**Scope:** `apps/web` (the gallery SPA) and `packages/ui` (its primitives).

**Out of scope:** `be/apps/dashboard` (a linear, data-first admin aesthetic — a deliberately
different system, see `be/apps/dashboard/AGENTS.md`), `apps/mobile` (native Swift/UIKit,
localized and styled natively), `apps/site` (Astro marketing site).

**Authority.** This document is derived from the shipped code, not from intent.
It is
normative for new code.
A handful of existing files predate it and contradict it — those are
enumerated in [§13 Known Deviations](#13-known-deviations).
Do not copy a deviation just
because it is nearby in the tree.
If you find code that contradicts this document and is _not_
listed in §13, the document is stale: fix the document in the same PR.

---

## 1. Core Principle

> **The photograph is the only light source. Everything else is glass in front of it.**

Chrome is dark, semi-transparent, and made of _material_ that the content shows through.
Depth
comes from stacking translucent layers, not from drop shadows.
The accent colour is not the
brand's — it is derived from the current photo.
Every control that is not needed right now
recedes to zero opacity.

This is Apple's platform language ported to the web: UIKit semantic colours, `UIVisualEffectView`
materials, and SwiftUI's `spring(duration:bounce:)` motion model.

---

## 2. Colour

### 2.1 Everything is a semantic token

The palette comes from `tailwindcss-uikit-colors/v4/macos.css` (imported in
`apps/web/src/styles/tailwind.css`).
There are four families, and hierarchy is expressed by
walking _down a family_, never by picking a different hue.

| Family                                          | Use for                                            | Ladder                                                                      |
| ----------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `text-text-*`                                   | Foreground text                                    | `text-text` → `-secondary` → `-tertiary` → `-quaternary` → `-quinary`       |
| `bg-fill-*` / `border-fill-*`                   | Opaque-ish control and surface fills, hairlines    | `-fill` → `-secondary` → `-tertiary` → `-quaternary` → `-quinary`           |
| `bg-material-*`                                 | Translucent surfaces sitting over content (see §3) | `-ultra-thin` → `-thin` → `-medium` → `-thick` → `-ultra-thick` → `-opaque` |
| System hues (`red`, `green`, `blue`, `orange`…) | Semantic status only                               | —                                                                           |

**Rules**

- Never write a raw hex, `rgb()`, or a Tailwind neutral ramp (`gray-*`, `zinc-*`, `slate-*`) for
  UI chrome.
  The only legitimate raw hex is a third-party brand mark (e.g. the Google `G` in
  `SignInPanel`).
- Never hand-roll a light/dark pair (`text-gray-900 dark:text-gray-50`).
  UIKit tokens already
  resolve per scheme; writing the pair yourself means you picked the wrong token.
- `white/N` and `black/N` are allowed **only** on top of a photograph, where the backdrop is an
  unknown image rather than an app surface — e.g. the viewer's chrome buttons
  (`text-white`, `hover:bg-black/40`) and `GlassButton` (`border-white/10`).

### 2.2 Accent is content-derived, in two stages

1. **Site level.** `siteConfig.accentColor` is injected as `--color-accent` / `--color-primary`
   / `--color-secondary` by an inline `<style>` in `apps/web/src/pages/(main)/layout.sync.tsx`.
   The fallback when unset is `#86c9ae` (the daisyUI `dark` theme block in `tailwind.css`).
2. **Photo level.** `apps/web/src/lib/color.ts` extracts a dominant colour from the photo's
   thumbhash and passes it through `clampAccentContrast()`, which forces the WCAG contrast ratio
   against `#1c1c1e` into the band **2.2 – 4.5** — bright enough to read, dim enough not to
   compete with the photo.

Consume it as `accent`: `bg-accent`, `text-accent`, `border-accent/20`.
Never hardcode the accent hex.

### 2.3 Accent appears at low opacity

Accent is a tint, not a fill, everywhere except a primary button and an active state.

| Role                                       | Class                             |
| ------------------------------------------ | --------------------------------- |
| Border on a glass surface                  | `border-accent/20`                |
| Wash on a glass surface                    | `bg-accent/5`, `bg-accent/[0.03]` |
| Hover on a text button                     | `hover:bg-accent/10`              |
| Solid fill (primary button, active toggle) | `bg-accent`, `hover:bg-accent/90` |

Reach for `color-mix(in srgb, var(--color-accent) N%, transparent)` in an inline style **only**
for multi-stop gradients and multi-layer `box-shadow`, which Tailwind opacity modifiers cannot
express (see the `[data-sonner-toast]` block in `tailwind.css`).

### 2.4 Dark is the only scheme

`apps/web/index.html` hardcodes `<html lang="en" data-theme="dark">`.
There is no theme toggle
and the `dark:` variant only matches `[data-theme='dark']`. `--color-background` is `#1c1c1e`
(Apple's dark `systemBackground`).

Do not add a light mode, a theme switcher, or `prefers-color-scheme` branches for chrome.
Writing
`dark:` on a new component is redundant — it is always true.

---

## 3. Depth & Material

Depth is **transparency stacked in front of content**.
A surface is defined by three things
together: a material fill, a backdrop blur matched to its role, and a hairline border.

### 3.1 Blur is chosen by role, not by taste

| Role                                                | Class               | Canonical examples                                                                                                                                        |
| --------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floating panel, menu, popover, toast, viewer chrome | `backdrop-blur-2xl` | `context-menu`, `dropdown-menu`, `hover-card`, `dialog`, `sonner`, `tooltip`, `InspectorPanel`, `ExifPanel`, `FloatingActionButton`, `PhotoViewer` chrome |
| Secondary control floating **on a photograph**      | `backdrop-blur-md`  | `MasonryPhotoItem` badges, `ListView` overlays, map markers, `FilterChip`, `GlassButton`                                                                  |
| Scrim / overlay behind a modal                      | `backdrop-blur-sm`  | `Dialog.Overlay`, `ActionPanel` overlay                                                                                                                   |
| Top / bottom fade band over scrolling content       | `<LinearBlur />`    | `PageHeader`, `PageFooter`                                                                                                                                |

`LinearBlur` (`packages/ui/src/progressive-blur`) is a _progressive_ blur: 8 stacked
`backdrop-filter` layers under `linear-gradient` masks.
It is not interchangeable with
`backdrop-blur-*` — use it whenever content must fade under a fixed edge rather than hit a hard
boundary.

```tsx
<LinearBlur
  className="pointer-events-none absolute inset-x-0 z-[-1] h-15"
  tint="var(--color-background)"
  strength={128}
  side="top"
/>
```

**Do not introduce a fourth blur step.** `xl`, `3xl`, and `lg` occurrences in the tree are
deviations (§13.2).

### 3.2 Material picks the opacity of the surface

`bg-material-*` and `backdrop-blur-*` are always used together — a material without a blur is
just a flat translucent rectangle.

| Material                           | Use for                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `bg-material-ultra-thick`          | Chrome sitting directly on a photo, where legibility wins (`PhotoViewer` buttons) |
| `bg-material-thick` / `-medium`    | Standard floating panels and menus                                                |
| `bg-material-thin` / `-ultra-thin` | Light washes where the content below must stay readable                           |
| `bg-material-opaque`               | Full-bleed backdrops that must fully hide what is behind (`PhotoViewer` backdrop) |

### 3.3 Borders are hairlines that fade

- Standard edge on a glass surface: `border border-accent/20`, or `border-white/10` when over a
  photograph.
- Structural edges use `LinearBorderContainer` (`packages/ui/src/container`): 0.5px pseudo-borders
  painted with `linear-gradient(transparent → tint → transparent)`, so an edge is brightest at its
  midpoint and vanishes at the corners.
  Pass `tint="var(--color-accent)"` to tint it.
- Never use a solid 1px `border-fill` as a divider inside a glass surface.
  Use `LinearDivider`
  (`packages/ui/src/divider`) or a fading gradient.

### 3.4 Shadows are many and faint

A single hard `box-shadow` is wrong.
Stack 2–3 very low-alpha shadows, and tint them with the
accent when the surface is accent-bordered.

```css
box-shadow:
  0 8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent),
  0 4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent),
  0 2px 8px rgba(0, 0, 0, 0.1);
```

`.shadow-context-menu` (three stacked shadows at 6.7% black) is the reusable neutral version.
Prefer it over Tailwind's `shadow-md` / `shadow-lg` scale for any glass surface.

---

## 4. Shape & Size

### 4.1 Radius maps to container size

| Radius                      | Use for                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `rounded-full`              | Circular icon buttons, pill badges, filter chips, drag handles                          |
| `rounded-2xl`               | Large floating containers — dialog, hover-card, toast, hero blocks, map info panel      |
| `rounded-xl`                | Menus, tooltips, mid-size cards and panels                                              |
| `rounded-lg`                | Control containers — segmented controls, inputs, header buttons, small cards            |
| `rounded-md` / `rounded-sm` | Items _inside_ a control container — segment items, list rows, EXIF rows, command items |

The pattern that recurs: **a container is one step rounder than the items inside it**
(`context-menu` is `rounded-xl`, its items are `rounded-lg`).

### 4.2 Control sizes

Circular icon buttons come in two sizes and nothing else:

| Size     | Use                                                 |
| -------- | --------------------------------------------------- |
| `size-8` | Default icon button (viewer chrome, header actions) |
| `size-7` | Compact / dense contexts                            |

Text buttons use the `Button` size scale from `packages/ui/src/button/Button.tsx`
(`xs` h-6 · `sm` h-8 · `md` h-10 · `lg` h-11 · `xl` h-12), default `sm`.

The fixed page header is `h-12` with `px-3` on mobile and `px-4` on desktop.

---

## 5. Typography

- **Sans (default):** `Geist`, then `ui-sans-serif`/`system-ui`.
  Applied on `html` via `font-sans`.
- **Serif:** a CJK-first stack (`Noto Serif SC`, `Source Han Serif`, …) for editorial moments.
- **Mono:** the Nerd-Font/Operator Mono stack, for EXIF values and raw data.

The type scale is deliberately **dense**: `text-sm` and `text-xs` account for the large majority
of all sizing in the tree. `text-base` and up belong to headings and empty states, not to UI
chrome.
Metadata (EXIF, timestamps, counts) is `text-xs` with `text-text-secondary` or
`-tertiary`.

Use `EllipsisWithTooltip` (`packages/ui/src/typography`) instead of bare `truncate` whenever the
truncated string carries information the user may need.

---

## 6. Motion

Two systems, split by what is moving.

### 6.1 Springs for anything that moves in space

Layout, entry/exit, gestures, and shared-element transitions use `motion` springs from the shared
preset object — **never** a hand-written `cubic-bezier` or a `duration`-only tween.

```text
import { Spring } from '@afilmory/utils'

transition={Spring.presets.smooth}   // duration 0.4, bounce 0    — default
transition={Spring.presets.snappy}   // duration 0.4, bounce 0.15 — controls, toggles
transition={Spring.presets.bouncy}   // duration 0.4, bounce 0.3  — playful, use sparingly
Spring.smooth(0.6)                   // tune the duration, keep the shape
```

`packages/viewer-motion` exports its own `ViewerSpring` with the same `smooth`/`snappy` shapes,
for use inside the framework-agnostic viewer engine where `@afilmory/utils` is not a dependency.

Import `m` from `motion/react` (not `motion`) so the tree-shaken build is used.

### 6.2 CSS durations for micro-states only

Opacity, colour, and other non-spatial state changes use plain CSS transitions:

| Duration       | Use                                     |
| -------------- | --------------------------------------- |
| `duration-200` | Default hover / focus / active feedback |
| `duration-300` | Slower fades, reveals                   |
| `duration-150` | Fast acknowledgement (pressed states)   |

If a property changes _position or size_, it belongs in §6.1, not here.

### 6.3 Shared-element transition into the viewer

Opening a photo is a FLIP transition from the grid cell to the fullscreen viewer, not a fade.
The grid cell contributes its trigger element:

```tsx
import { getViewerTransitionTriggerProps } from '@afilmory/viewer-motion'

photoViewer.openViewer(photoIndex, triggerEl)
```

The image itself is progressive: `Thumbhash` placeholder → low-res → full resolution
(`ProgressiveImage`, `GalleryThumbnail`).
Never show a spinner where a thumbhash can go.

### 6.4 Hover state is CSS, not JavaScript

Prefer `[data-highlighted]` (Radix sets it) and `group-hover/*` variants over `onMouseEnter`
handlers.
The recurring pattern for reveal-on-hover chrome:

```tsx
<div className="group/photo-viewer relative">
  <button className="opacity-0 duration-200 group-hover/photo-viewer:opacity-100" />
</div>
```

---

## 7. Layering (z-index)

z-index is scoped to the nearest positioned ancestor, so there are two tiers, not one.

### 7.1 Surface tier — for `fixed` roots and portals

| z      | Layer                                                                            |
| ------ | -------------------------------------------------------------------------------- |
| `z-30` | Persistent page chrome — `PageHeader`, `FloatingActionButton`, `ViewModeSegment` |
| `z-40` | Scrim / overlay behind a modal                                                   |
| `z-50` | Modal surface — dialog, drawer, `PhotoViewer`, command palette                   |
| `z-60` | Popper spawned _from_ a surface — dropdown, select, context menu                 |
| `z-70` | Toast and tooltip — always on top                                                |

### 7.2 Intra-surface tier — inside a card or a modal surface

| z      | Layer                                                                           |
| ------ | ------------------------------------------------------------------------------- |
| `z-1`  | Hairline borders and structural gradients                                       |
| `z-10` | Decoration — gradients, hover scrims, image overlays                            |
| `z-20` | Badges and inline affordances — `LivePhotoBadge`, `HDRBadge`, viewer nav arrows |
| `z-30` | Chrome bar inside the surface — the viewer's top button row                     |

**Never invent a value outside these tables.** If something needs to be above a tooltip, the
stacking is wrong, not the number.
Values like `z-9999` and `z-100000000` in the tree are
deviations (§13.3).

---

## 8. Layout

### 8.1 Content first, chrome floats

There is no header/sidebar/content shell.
The masonry grid is the page; every control is a
floating overlay above it.

- `PageHeader` is `fixed`, 48px tall, with a `LinearBlur` fade band instead of an opaque bar.
- Secondary actions live in a `FloatingActionButton` cluster, not a toolbar.
- Desktop-only affordances (viewer prev/next arrows) start at `opacity-0` and appear on
  `group-hover`.
- Metadata — EXIF, histogram, map — lives in a collapsible `InspectorPanel`, never occupying
  layout by default.

### 8.2 The grid

`masonic` provides the virtualized masonry (`MasonryView`); `ListView` is the alternate mode.
Item
height is computed from `data.aspectRatio`, never measured, so the grid never reflows on image
load.

### 8.3 Scrolling

Desktop wraps content in `ScrollArea` (`packages/ui/src/scroll-areas`) with a custom thin
scrollbar.
Mobile scrolls `document.body` directly.
The branch lives in
`apps/web/src/pages/(main)/layout.sync.tsx` and is keyed on `useMobile()`.

Anything that needs the scroll container must read `ScrollElementContext` rather than assuming
`window`.

### 8.4 Mobile

- Bottom sheets use `vaul` (`Drawer.Root`), with a `h-1.5 w-12 rounded-full` grab handle.
- Gestures use `@use-gesture/react` — swipe-to-dismiss in the viewer, pan on the stage.
- Respect the safe area with `tailwindcss-safe-area` utilities (`pb-safe`), never a magic `pb-8`.
- `useMobile()` is the single source of truth for the breakpoint branch.
  Do not add ad-hoc
  `md:` breakpoints for a behavioural (not cosmetic) difference.

---

## 9. Iconography

`i-mingcute-*` via `@egoist/tailwindcss-icons` is the icon system.
It is used as a bare
`<i className="i-mingcute-...">` element, sized with `size-4` / `text-lg`.

```tsx
<i className="i-mingcute-information-line" />
```

`i-simple-icons-*` is allowed for third-party brand marks only (GitHub, Google).
Do not add new
`lucide-react` imports — the existing ones are a deviation (§13.4).

Project-specific icons live in `apps/web/src/icons` and are named after the source set
(`TablerAperture`, `CarbonIsoOutline`).

---

## 10. Component Sourcing

```
packages/ui/          Headless-first primitives, zero product knowledge.
                      Radix + tailwind-variants + motion. Reusable across apps.

apps/web/src/components/ui/     Product-shaped but domain-free (map, slider, number).
apps/web/src/modules/<domain>/  All real UI and logic.
apps/web/src/pages/             Thin routing shells. No layout, no business logic.
```

**Decide where a component goes by asking whether it knows about photos.** If it does, it belongs
in `modules/`.
If it does not and another app could want it, it belongs in `packages/ui`.

Primitives are built on **Radix UI** (16 files) wrapped with **`tailwind-variants`** (`tv`) for
variants. `@headlessui/react` is a dead dependency — do not use it (§13.5).

`clsxm` from `@afilmory/utils` (clsx + tailwind-merge) is the only class-merging helper.

---

## 11. Interaction & State

- **URL is the source of truth** for anything shareable: gallery filters live in search params
  (`?tags=&cameras=&lenses=&rating=&from=&to=&tag_mode=`, synced with `replace: true` so filter
  churn does not pollute history), and the open viewer is a route (`/photos/:photoId`).
  A new
  view-affecting control must be reflected in the URL.
- **Jotai** holds ephemeral UI state (`apps/web/src/atoms/`).
  Prefer a colocated atom or context
  in the feature module over threading props through layers.
- **Push state down.** Switching a tab or a view mode should unmount the inactive subtree, not
  hide it.
- **Command palette** (`modules/cmdk`) is the keyboard entry point for global actions.
  A new
  global action should be registered there rather than only existing as a button.

---

## 12. Accessibility

Current state is thin and this is a known gap, not a licence to ignore it.
For new work:

- `focusRing` from `@afilmory/utils` on every interactive element.
  Note that the global CSS
  removes the default outline (`*:focus { outline: none }`), so an explicit focus style is
  mandatory, not optional.
- Icon-only buttons need an accessible name (`aria-label`, or `sr-only` text as `Button` does for
  its loading state).
- Guard new motion behind `prefers-reduced-motion`.
  Only two call sites currently do
  (`SlidingNumber`, `PhotoViewer.css`) — extend the pattern rather than matching the majority.

---

## 13. Known Deviations

These exist in the tree and contradict the rules above.
They are **not** the pattern to copy.
Existing code is not required to migrate immediately; new code must not add to these lists.

### 13.1 Colour

| Where                                                     | What                                                                                                            | Rule broken                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/ui/src/button/Button.tsx`                       | Vendored Tremor component using `text-gray-900 dark:text-gray-50`, `bg-gray-200 dark:bg-gray-900`, `bg-red-600` | §2.1 — neutral ramps and hand-rolled light/dark pairs instead of UIKit tokens |
| `packages/utils/src/cn.ts` (`focusRing`, `hasErrorInput`) | `outline-blue-500`, `border-red-500`, `ring-red-200`                                                            | §2.1 / §2.2 — focus ring should follow `--color-accent`                       |
| `apps/web/src/modules/gallery/ActionPanel.tsx:25`         | `bg-white/80 dark:bg-black/80 border-zinc-200 dark:border-zinc-800`                                             | §2.1 / §3.2 — should be `bg-material-thick`                                   |

### 13.2 Blur

| Where                                                                                                         | What                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `HistogramChart`, `ActionPanel`, `PageHeaderRight`, `Reaction`, `manifest.tsx`, `PhotoViewer`, `ActionButton` | `backdrop-blur-xl` — a step that has no assigned role                                                                           |
| `MobilePhotoInspectorSheet`, `ScrollArea`                                                                     | `backdrop-blur-3xl`                                                                                                             |
| `Reaction`                                                                                                    | `backdrop-blur-lg`                                                                                                              |
| `ActiveFiltersHero/index.tsx` (×2), `inspector/LoadingIndicator.tsx`                                          | bare `backdrop-blur` (Tailwind's unsuffixed 8px default)                                                                        |
| `packages/ui/src/select/index.tsx`, `packages/ui/src/sonner.tsx`                                              | `backdrop-blur-background` — **not a valid Tailwind class**; no `--blur-background` theme key exists, so it compiles to nothing |

### 13.3 z-index

`PageHeader` (`z-100`), `tooltip/styles.ts` + `CommandPalette` + `photos/[photoId]` (`z-9999`),
`context-menu` (`z-10060` / `z-10061`), `dialog/dialog.tsx` (`z-100000000`).
All predate §7.

### 13.4 Icons

`lucide-react` is imported in 10 files (e.g. `PanelRightOpen` in `PhotoViewer`) alongside the
129 `i-mingcute-*` usages.
Two icon systems, no rule separating them.

### 13.5 Dead / no-op code

| Where                                                                   | What                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/package.json`                                                 | `@headlessui/react` is a dependency with **zero** imports in `src`                                                                                                                                          |
| `packages/ui/src/button/Button.tsx`, `packages/ui/src/modal/Dialog.tsx` | `shape-squircle` class is applied, but it is only _defined_ in `be/apps/dashboard/src/styles/tailwind.css`. In `apps/web` it is a **no-op** — those components do not actually get `corner-shape: squircle` |
| `packages/ui/src/index.ts`                                              | `./checkbox` and `./sonner` are each exported twice                                                                                                                                                         |

---

## 14. Checklist Before Shipping UI

1. No raw hex, no `gray-*`/`zinc-*`/`slate-*`, no hand-written `dark:` pair.
   (§2)
2. Blur step matches the element's role, and pairs with a `bg-material-*`.
   (§3.1, §3.2)
3. Radius matches container size; items are one step tighter than their container.
   (§4.1)
4. Anything moving in space uses a `Spring` preset; only opacity/colour uses `duration-*`.
   (§6)
5. z-index comes from the two tables in §7 — no new magic number.
6. New view state is reflected in the URL.
   (§11)
7. Interactive element has `focusRing` and an accessible name.
   (§12)
8. Component lives in `modules/` if it knows about photos, `packages/ui` if it does not.
   (§10)
9. Zero comments and zero JSDoc in the component you wrote — good names carry it.
10. `pnpm lint <changed paths>` and `pnpm --filter web type-check` pass.
