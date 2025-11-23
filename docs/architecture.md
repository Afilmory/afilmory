# Architecture Overview

- **apps/web**: React 19 + Vite SPA. Consumes `photos-manifest.json` and thumbnails under `apps/web/public`. Runs standalone or with injected manifest.
- **apps/ssr**: Next.js 15 wrapper. Injects manifest into HTML for SEO/OG and serves SPA assets. Provides dynamic OG generation.
- **packages/builder**: Photo pipeline. Syncs from storage (S3/B2/GitHub/local/Eagle), processes images, and writes manifest + thumbnails into the SPA.
- **packages/data / packages/utils / packages/hooks / packages/components / packages/ui**: Shared data access, utilities, hooks, and design system pieces.
- **be/**: Backend (Hono) and dashboard apps. Tenant/auth/billing logic lives here; see `docs/backend/*` and `be/apps/*/AGENTS.md`.

## Data Flow

1. Builder downloads photos from configured storage.
2. Generates thumbnails and `photos-manifest.json` (`apps/web/src/data/photos-manifest.json`).
3. SPA loads manifest either from the bundled JSON or `window.__MANIFEST__` when SSR/backend injects it.
4. SSR wraps SPA for SEO/OG; backend can also inject manifest for full-server mode.

## Key Traits

- Incremental sync to avoid reprocessing unchanged photos.
- Adapter pattern for storage providers.
- Shared types between builder, SPA, and SSR/backends to keep manifest schema aligned.
