# Development Guide

This document is for contributors and self-hosters who want to customize or run Afilmory from source.

## Workspace Layout

- `apps/web`: React + Vite SPA that consumes `photos-manifest.json` and generated thumbnails under `apps/web/public`.
- `apps/ssr`: Next.js wrapper that injects the manifest for SEO/OG and proxies SPA assets.
- `packages/builder`: Photo pipeline that syncs sources → processes images → writes manifest/thumbnails into the SPA.
- `config.json` + `site.config.ts`: Presentation/content config merged at runtime for both SPA and SSR.
- `builder.config.ts`: Builder pipeline config (storage, concurrency, repo sync, plugins).

## Quick Start (from source)

1. Install dependencies

```bash
pnpm install
```

2. Copy configs and fill values

```bash
cp config.example.json config.json
cp builder.config.default.ts builder.config.ts
```

3. Environment variables (`.env`)

- Storage: `S3_REGION`, `S3_ENDPOINT`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PREFIX`, `S3_CUSTOM_DOMAIN`, `S3_EXCLUDE_REGEX`
- Repo sync (optional): `GIT_TOKEN`, `BUILDER_REPO_URL`, `BUILDER_REPO_BRANCH`

4. Build/update manifest and thumbnails (writes to `apps/web/src/data/photos-manifest.json` and `apps/web/public`)

```bash
pnpm run build:manifest             # incremental
pnpm run build:manifest -- --force # full rebuild
```

5. Run the app

```bash
pnpm dev              # SPA + SSR
pnpm --filter web dev # SPA only
pnpm --filter @afilmory/ssr dev # SSR wrapper only
```

## Builder Configuration (`builder.config.ts`)

The builder uses `defineBuilderConfig` from `@afilmory/builder`. `builder.config.default.ts` shows the recommended shape:

```ts
import os from 'node:os'
import { defineBuilderConfig, githubRepoSyncPlugin } from '@afilmory/builder'
import { env } from './env.js'

export default defineBuilderConfig(() => ({
  storage: {
    // Switch to { provider: 'local', basePath, baseUrl } for local-only testing.
    provider: 's3',
    bucket: env.S3_BUCKET_NAME,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    prefix: env.S3_PREFIX,
    customDomain: env.S3_CUSTOM_DOMAIN,
    excludeRegex: env.S3_EXCLUDE_REGEX,
    downloadConcurrency: 16,
  },
  system: {
    processing: { defaultConcurrency: 10, enableLivePhotoDetection: true, digestSuffixLength: 0 },
    observability: {
      showProgress: true,
      showDetailedStats: true,
      logging: { verbose: false, level: 'info', outputToFile: false },
      performance: {
        worker: { workerCount: os.cpus().length * 2, timeout: 30_000, useClusterMode: true, workerConcurrency: 2 },
      },
    },
  },
  plugins: [
    githubRepoSyncPlugin({
      repo: {
        enable: false,
        url: process.env.BUILDER_REPO_URL ?? '',
        token: env.GIT_TOKEN,
        branch: process.env.BUILDER_REPO_BRANCH ?? 'main',
      },
    }),
  ],
}))
```

Notes:

- B2/GitHub storage are also supported (see comments in `builder.config.ts`).
- Outputs land in `apps/web/public/thumbnails` and `apps/web/src/data/photos-manifest.json`.

## Site Presentation Config (`config.json`)

`config.json` merges into `site.config.ts` for both SPA and SSR:

- `name` / `title` / `description` / `url` / `accentColor`
- `author`: `{ name, url, avatar }`
- `social`: `{ github?, twitter?, rss? }`
- `feed`: supports `folo.challenge.feedId` and `userId`
- `map`: map providers, e.g. `["maplibre"]`
- `mapStyle`: `builtin` or provider-specific style
- `mapProjection`: `globe` or `mercator`

## Common Commands

```bash
# Lint and format
pnpm lint
pnpm format

# Type check (web)
pnpm --filter web type-check

# Build production
pnpm build
```
