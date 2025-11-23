# Deployment & Hosting

## Option A: Docker (recommended)

Use the prebuilt images and guide at https://github.com/Afilmory/docker for the fastest setup.

## Option B: Manual

1) Prepare configs  
- Copy `config.example.json` → `config.json`, fill site info and map settings.  
- Copy `builder.config.default.ts` → `builder.config.ts`, set storage provider/credentials.  
- Add environment variables in `.env` (storage + optional repo sync).

2) Build manifest and thumbnails  

```bash
pnpm run build:manifest             # incremental
pnpm run build:manifest -- --force # full rebuild
```

3) Run servers  

```bash
pnpm dev              # SPA + SSR
pnpm --filter web dev # SPA only
```

4) Production build  

```bash
pnpm build
```

### Storage Notes

- S3-compatible endpoints work out of the box; set `customDomain` if you serve assets via CDN.
- Local-only testing: set `storage.provider` to `local` with `basePath`/`baseUrl`.
- GitHub/B2/Eagle providers are available—see `builder.config.default.ts` for examples.

### Manifest Outputs

- `apps/web/public/thumbnails` (generated thumbnails)
- `apps/web/src/data/photos-manifest.json` (metadata used by SPA/SSR)
