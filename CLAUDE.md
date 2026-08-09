# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Authoritative Guides

This repo already has detailed `AGENTS.md` files. Read the one closest to the code you are touching before making non-trivial changes:

- `AGENTS.md` (root) — full commands list, monorepo architecture, manifest/data flow, i18n rules.
- `apps/web/AGENTS.md` — Glassmorphic Depth design system used by the SPA (color/opacity rules, blur, shadows, hover via `data-highlighted`).
- `be/AGENTS.md` — the NestJS-style Hono framework: modules, controllers, providers, decorators, DI via `tsyringe`, request-scoped context via `AsyncLocalStorage`. **Stale on package names**: it says `@afilmory/framework`, but the framework was extracted to npm as `@tsuki-hono/{core,common,openapi,event-emitter}`. The concepts still apply; the import paths don't.
- `be/apps/core/AGENTS.md` — backend core service architecture.
- `DEVELOPMENT.md` — self-host quick start and config field reference (`builder.config.ts`, `config.json`).
- `.cursor/rules/*.mdc` — code quality, color (Apple UIKit Tailwind classes), i18n, project description.
- `docs/superpowers/specs/*.md` — dated design specs (`YYYY-MM-DD-<topic>-design.md`) for most non-trivial features; `docs/superpowers/plans/` holds their execution plans. Check for an existing spec before redesigning something.

When those files contradict anything below, prefer them (except where flagged stale above).

## Commands

```bash
# Dev
pnpm dev                          # SSR wrapper (also serves SPA in dev, Next on :1924)
pnpm --filter web dev             # SPA only
pnpm --filter @afilmory/ssr dev   # SSR only
pnpm dev:be                       # Backend (be/apps/core) via nodemon
pnpm --filter @afilmory/dashboard dev  # Admin dashboard
pnpm dev:mobile                   # Build + run the native iOS app (Local variant) in Simulator
pnpm site:dev                     # Astro marketing site (127.0.0.1:4325)
pnpm docs:dev                     # Docs site

# Build
pnpm build                        # Production build (via @afilmory/ssr)
pnpm build:demo                   # Demo data + web build
pnpm build:manifest               # Run photo pipeline → photos-manifest.json + thumbnails (incremental)
pnpm build:manifest -- --force            # Full rebuild of photos AND manifest
pnpm build:manifest -- --force-manifest   # Regenerate manifest only
pnpm build:manifest -- --force-thumbnails # Regenerate thumbnails only
pnpm build:variant-report         # Builder cluster/variant analysis report

# DB (Drizzle; schema lives in be/packages/db, SSR has its own)
pnpm --filter @afilmory/be db:generate / db:migrate / db:studio
pnpm --filter @afilmory/ssr db:generate / db:migrate

# Quality
pnpm lint                         # eslint --fix (append paths to scope it: `pnpm lint apps/web/src/...`)
pnpm format                       # prettier (apps, packages, be)
pnpm type-check                   # recursive `pnpm -r type-check`
pnpm --filter web type-check      # type-check just the SPA

# Local infra
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# docker-compose.yml owns postgres/redis; docker-compose.dev.yml adds only rustfs (S3) on :9300/:9301.
# Never redefine `db`/`redis` in the dev file — same project name silently recreates them on different volumes.
```

### Tests

There is no repo-wide test runner; tests are per-package and use two different harnesses.

```bash
pnpm --filter @afilmory/be test                    # recursive across be/*
pnpm --filter @afilmory/task-queue test            # vitest run --coverage
pnpm --filter core exec vitest run <file>          # be/apps/core has vitest.config.ts but no `test` script
pnpm --filter @afilmory/viewer-motion test         # node:test via `tsx --test src/*.test.ts`
pnpm exec tsx --test apps/web/src/modules/viewer/entry-animation-state.test.ts  # web's node:test files
```

Single vitest test: `pnpm --filter core exec vitest run src/guards/auth.guard.spec.ts -t "test name"`.
For everything else, verify via `pnpm build`, `pnpm type-check`, `pnpm lint`, and (for image processing) `pnpm build:manifest`.

Package manager is **pnpm 11** (`packageManager` pin in root `package.json`). Workspace globs in `pnpm-workspace.yaml`: `apps/**/*`, `packages/*`, `packages/*/*`, `be`, `be/packages/*`, `be/apps/*`. Pinned versions live in the pnpm `catalog:` (`tailwindcss`, `typescript`, `zod`, `motion`, …) — prefer `catalog:` over a literal version when adding a shared dep.

## Architecture (Big Picture)

Afilmory is a photo gallery composed of several deployable layers plus a builder pipeline. The same SPA runs in all serving modes; the difference is **who injects `window.__MANIFEST__`**.

```
┌──────────────────────────────────────────────────────────────────────┐
│                     packages/builder (CLI pipeline)                  │
│   sync (S3/GitHub/Eagle/local) → format/EXIF → thumbs/blurhash       │
│              → photos-manifest.json (+ optional repo sync)           │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                writes apps/web/src/data/photos-manifest.json
                                 │
┌────────────────────────────────▼─────────────────────────────────────┐
│  apps/web (Vite + React 19 SPA)                                      │
│    PhotoLoader reads window.__MANIFEST__ (data, cameras, lenses)     │
│    Standalone fallback: bundled manifest JSON                        │
└────────────────────────────────▲─────────────────────────────────────┘
                                 │ injects __MANIFEST__
        ┌────────────────────────┼─────────────────────────┐
        │                                                  │
┌───────┴───────────────┐                       ┌──────────┴──────────┐
│ apps/ssr (Next.js 15) │                       │ be/apps/core (Hono) │
│ static manifest JSON  │                       │ DB-backed manifest  │
│ + dynamic OG / SEO    │                       │ + dashboard / API   │
└───────────────────────┘                       └──────────┬──────────┘
                                                           │ REST + SSE
                                                ┌──────────┴──────────┐
                                                │ apps/mobile (Swift) │
                                                │ native iOS client   │
                                                └─────────────────────┘
```

Key implications when changing things:

- **`apps/web` is the only web UI codebase.** It must work in *both* the static/SSR flow and the full backend flow. Don't assume a backend is present — feature-detect on `window.__MANIFEST__` shape.
- **The SPA has two build modes**, switched by env, not by config file: `BUILD_FOR_SERVER_SERVE=1` moves the Vite `base` to `/static/web/` and drops the static-web plugins; `AFILMORY_EMBED_MANIFEST=false` stops inlining the manifest so the server can inject it. `be/apps/core` sets both when it builds the SPA it serves (see `static-web.service.ts`).
- **`packages/data`** owns `PhotoLoader` (the singleton that wraps the manifest into lookup maps). Anything photo-related goes through it. Shared types live in `packages/typing`.
- **`packages/builder`** is the only place that talks to storage providers (S3/B2/GitHub/Eagle/local). It is configured by `builder.config.ts` (infrastructure) which is separate from `site.config.ts` + `config.json` (presentation/branding).
- **`be/`** uses a NestJS-inspired Hono framework (`@tsuki-hono/core`): `@Module`, `@Controller`, `@Get/@Post/...`, `@injectable()`, request context via `AsyncLocalStorage`. Don't reach for raw Hono primitives in feature code — use the framework decorators (see `be/AGENTS.md`).
- **`apps/ssr` is a thin host**, not a backend. Its job is to serve the SPA and provide OG/SEO/manifest injection. Heavy logic belongs in `be/apps/core` or `packages/builder`.
- **Two separate design systems**: `apps/web` uses the Glassmorphic Depth system (see `apps/web/AGENTS.md`); `be/apps/dashboard` is a linear, data-first admin UI. Don't mix the two.

### Workspace Map

| Path | What it is |
| --- | --- |
| `apps/web` | Vite + React 19 SPA — the gallery UI (the only web UI codebase) |
| `apps/ssr` | Next.js 15 host: serves SPA assets, injects manifest, dynamic OG/SEO |
| `apps/mobile` | Native Swift/UIKit iOS app (see below) |
| `apps/site` | Astro marketing/landing site |
| `apps/docs` | Vite-based documentation site |
| `be/apps/core` | Hono backend: DB-backed manifest, REST API, serves SPA |
| `be/apps/dashboard` | Admin SPA for the backend |
| `be/apps/oauth-gateway` | Standalone OAuth broker (own Dockerfile) |
| `be/packages/{db,redis,task-queue,utils,env}` | Drizzle schema/migrations, Redis client, job queue, shared backend utils, env validation |
| `packages/builder` | Photo pipeline CLI (the only storage-provider consumer) |
| `packages/data` | `PhotoLoader` singleton + bundled manifest |
| `packages/typing` | Shared photo/manifest types |
| `packages/webgl-viewer` | WebGL photo viewer engine |
| `packages/viewer-motion` | Framework-agnostic viewer motion primitives (has real unit tests) |
| `packages/renderer` | `@afilmory/og-renderer` — OG image rendering |
| `packages/sdk` | `@afilmory/sdk` — public SDK + share embed script |
| `packages/{ui,hooks,utils}` | Shared UI elements, React hooks, utilities |

## Mobile App (`apps/mobile`)

**Read `apps/mobile/CLAUDE.md` before touching mobile code** — it covers the architecture in depth. The essentials:

- **iOS only, forever.** Never spend effort on Android compatibility, fallbacks, or testing.
- **It is a pure native Swift/UIKit app.** Expo / React Native was deleted in `66fae030`; there is no Metro, no JS runtime, no CocoaPods, and no npm dependencies. `package.json` only wraps XcodeGen and xcodebuild.
- **`project.yml` (XcodeGen) is the source of truth**; `Afilmory.xcodeproj` is generated output that is nonetheless committed. Adding or deleting a `.swift` file requires `pnpm --filter @afilmory/mobile native:generate`. Never edit the project through the Xcode UI.
- **iOS 18 deployment target**, Swift 6. Post-18 APIs need an availability guard and an iOS 18 fallback — Liquid Glass goes through `NativeApp/Design/AdaptiveGlass.swift`.
- **Two variants from one source tree**: `Afilmory Local` (`app.afilmory.local`, `localhost:1841`, no entitlements) and `Afilmory` (production). Capability differences are gated centrally in `AfilmoryBuildConfiguration`.
- **Run/build/test**: `pnpm --filter @afilmory/mobile ios:local` / `ios:production` / `native:test`. TestFlight goes through `.github/workflows/mobile-testflight.yml`; see `apps/mobile/RELEASE.md`.
- **Simulator automation**: use `axe` (`brew install cameroncooke/axe/axe`) for tap/swipe HID injection + `xcrun simctl io <udid> screenshot`; never control the user's mouse (cliclick/AppleScript). Run the memory guard during Simulator verification — see `apps/mobile/AGENTS.md`.
- **UIGlassEffect gotcha**: `isInteractive = true` swallows touches meant for buttons hosted in the effect view's `contentView` — keep it off for tappable glass controls; floating control clusters need `UIGlassContainerEffect` hosting per-element `UIGlassEffect` views to get real refraction and merge behavior.

## Project Conventions That Matter

- **No feature flags or backwards-compat shims.** App is unreleased — change code in place. (Stated explicitly at the bottom of root `AGENTS.md`.)
- **Pages are thin routing shells.** Real UI/logic lives under `modules/<domain>/**` in `apps/web`.
- **State isolation over prop drilling.** For deep subtrees, lift handlers into colocated Jotai/Zustand stores or contexts; don't thread props through layers.
- **Push state down**, not up. Feature-local stores/providers; switching tabs should unmount unused logic.
- **Tailwind colors must use the Apple UIKit palette** (`text-text-secondary`, `bg-fill`, `bg-material-thick`, `border-accent/20`, …). See `.cursor/rules/color.mdc`. Avoid raw hex/inline styles unless `color-mix()` is unavoidable.
- **i18n: flat keys with `.` separators**, no nested objects. Two namespaces under `locales/`: `app/` (SPA) with `en, zh-CN, zh-HK, zh-TW, jp, ko`, and `dashboard/` (en + zh-CN only). Edit `en.json` of the relevant namespace first; ESLint auto-strips keys missing from English in other locales. **Never let a key be both a leaf string and a parent path** (`a.b` cannot coexist with `a.b.c`); the build flattens dots into nested objects and will collide. Use `_one`/`_other` for plurals.
- **The iOS app does not use `locales/`.** It localizes natively through String Catalogs — `apps/mobile/NativeApp/Resources/Localizable.xcstrings` (keys are the English source text, auto-extracted from `String(localized:)` / `Text(_:)` at build time), `ExifValues.xcstrings` (dotted keys for EXIF values looked up dynamically), and `apps/mobile/targets/share/Localizable.xcstrings` for the share extension.
- **No bare global `location`** — an ESLint `no-restricted-globals` rule forbids it (the router instance differs between Electron and browser). Use `useLocation()` or `getReadonlyRoute()`.
- **Decorators are enabled** (`emitDecoratorMetadata`, `experimentalDecorators`) for the backend framework.
- **`motion` / `motion-dom` are pinned** via pnpm `overrides` (currently `12.38.0`) — don't bump them casually. Same for the security-driven `overrides` on `hono`, `vite`, `esbuild`, `qs`, etc.

## Configuration Layering

Two configs, two purposes — don't conflate them:

- `builder.config.ts` (+ `builder.config.default.ts` template) → **infrastructure**: storage provider, concurrency, worker/cluster mode, repo sync plugin. Consumed only by `packages/builder`.
- `site.config.ts` + `config.json` → **presentation**: name, description, author, social, accent color, map provider/style/projection, feed, beian. Consumed by SPA, SSR, and backend for consistent branding.

Environment variables flow through `env.ts` (root — S3 + `PG_CONNECTION_STRING` + `GIT_TOKEN`) and `@afilmory/env` (backend) — both validate via Zod / `@t3-oss/env-core`.
