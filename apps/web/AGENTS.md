# agents.md

This agent file only applies under this folder.

## Design system

**`/DESIGN.md` at the repo root is the normative design spec for `apps/web` and `packages/ui`.
Read it before non-trivial UI work.** It is derived from the shipped code and covers colour
tokens, material/blur roles, radius, typography, motion, z-index tiers, layout, iconography, and
an explicit list of files that violate the system and must not be copied.

The `afilmory-web-design` skill (`.agents/skills/afilmory-web-design/`) is the fast path: the
surface recipe, lookup tables, and red lines.

## Red lines

Binary rules. The surrounding code never justifies breaking them — some existing files do, and
they are enumerated in `/DESIGN.md` §13.

- **Semantic tokens only.** No raw hex, `rgb()`, or `gray-*`/`zinc-*`/`slate-*` for chrome. Use
  the Apple UIKit families: `text-text-*`, `bg-fill-*`, `bg-material-*`, `border-accent/20`.
  `color-mix()` in an inline style is reserved for multi-stop gradients and layered shadows.
- **Dark-only.** `index.html` hardcodes `data-theme="dark"`. Never write a hand-rolled
  `dark:` pair, add a theme toggle, or branch on `prefers-color-scheme` for chrome.
- **Accent is content-derived.** Consume `var(--color-accent)` / `bg-accent`. Never hardcode
  the accent hex.
- **Springs for spatial motion.** `Spring.presets.*` from `@afilmory/utils`; no new
  `cubic-bezier`. `duration-200` and friends are for opacity/colour only.
- **z-index comes from the two tiers in `/DESIGN.md` §7.** No new magic numbers.
- **Blur has three roles**: `2xl` panels/menus/chrome, `md` controls over a photo, `sm` scrims.
  Use `LinearBlur` for fade bands under fixed edges.
- **Icons are `i-mingcute-*`.** No new `lucide-react` imports.

## Structure

- `pages/` — thin routing shells only. No layout, no business logic.
- `modules/<domain>/` — all real UI and logic. A component that knows about photos lives here.
- `components/ui/` — product-shaped but domain-free (map, slider, number).
- `packages/ui` (workspace) — headless-first primitives with zero product knowledge.

State that is shareable belongs in the URL (filters as search params, open photo as
`/photos/:photoId`). Ephemeral UI state belongs in a colocated Jotai atom, not prop drilling.
