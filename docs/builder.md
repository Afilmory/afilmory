# Builder Pipeline

The builder ingests photos from storage, processes them, and outputs thumbnails plus `photos-manifest.json` for the SPA/SSR.

## Pipeline Steps

1. Sync photos from the configured provider (S3/B2/GitHub/local/Eagle).
2. Convert formats (HEIC/TIFF), extract EXIF, detect Live Photos, and compute Blurhash.
3. Generate thumbnails and store under `apps/web/public/thumbnails`.
4. Serialize manifest to `apps/web/src/data/photos-manifest.json`.
5. (Optional) Sync thumbnails + manifest to a Git repo via `githubRepoSyncPlugin`.

## Commands

```bash
pnpm run build:manifest             # incremental
pnpm run build:manifest -- --force # full rebuild
pnpm run build:manifest -- --force-thumbnails
pnpm run build:manifest -- --force-manifest
```

## Storage Providers

- **s3** (default): AWS S3 or compatible endpoints (MinIO, OSS). Supports concurrency and connection tuning.
- **b2**: Backblaze B2.
- **github**: Uses a repo as object storage.
- **local**: Reads from disk (handy for testing).
- **eagle**: Reads from Eagle app library.

Configure providers in `builder.config.ts` (see examples in `builder.config.default.ts`).
