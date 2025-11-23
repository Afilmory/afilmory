# Configuration Guide

## Site Presentation (`config.json`)

- `name`, `title`, `description`, `url`, `accentColor`
- `author`: `{ name, url, avatar }`
- `social`: `{ github?, twitter?, rss? }`
- `feed`: optional `folo.challenge.feedId` and `userId`
- `map`: e.g. `["maplibre"]`
- `mapStyle`: `builtin` or provider style
- `mapProjection`: `globe` or `mercator`

`config.json` merges into `site.config.ts` and is used by both SPA and SSR.

## Builder Config (`builder.config.ts`)

Use `defineBuilderConfig` from `@afilmory/builder`. Recommended structure (see `builder.config.default.ts`):

- **storage**: provider (`s3`, `b2`, `github`, `local`, `eagle`), credentials, prefix, custom domain, `excludeRegex`, concurrency.
- **system.processing**: `defaultConcurrency`, `enableLivePhotoDetection`, `digestSuffixLength`.
- **system.observability**: progress/stats toggles, logging level/output, worker settings (`workerCount`, `timeout`, `useClusterMode`, `workerConcurrency`).
- **plugins**: e.g. `githubRepoSyncPlugin` for pulling/pushing thumbnails + manifest cache.
- Outputs: `apps/web/public/thumbnails`, `apps/web/src/data/photos-manifest.json`.

## Environment Variables (`.env`)

- Storage: `S3_REGION`, `S3_ENDPOINT`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PREFIX`, `S3_CUSTOM_DOMAIN`, `S3_EXCLUDE_REGEX`
- Repo sync (optional): `GIT_TOKEN`, `BUILDER_REPO_URL`, `BUILDER_REPO_BRANCH`
- Database (backend): `PG_CONNECTION_STRING` (see backend docs for more)

## App Commands (common)

```bash
pnpm dev                # SPA + SSR
pnpm --filter web dev   # SPA only
pnpm --filter @afilmory/ssr dev # SSR only
pnpm run build:manifest          # Build manifest + thumbnails (incremental)
pnpm run build:manifest -- --force # Full rebuild
pnpm build              # Production build
pnpm --filter web type-check
pnpm lint && pnpm format
```
