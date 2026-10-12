# OG Image Storage Plugin

This plugin renders Open Graph (OG) images for each processed photo and uploads them to remote storage.

## Examples

### Plugin usage

import `ogImagePlugin` and add it to your builder config's plugins array.
```ts
import { defineBuilderConfig, thumbnailStoragePlugin, ogImagePlugin } from '@afilmory/builder'

export default defineBuilderConfig(() => ({
    storage: {
        ...
    },
	plugins: [
		thumbnailStoragePlugin(),
        ogImagePlugin(
            {
                vendor: {
                    type: 'cloudflare-middleware', // OG image vendor type
                    storageURL: 'https://your-og-storage.example.com',
                    siteConfigPath: './config.json', // optional: defaults to repo root config.json
                },
            }
        )
	],
}))
```

The first time you use the plugin, you need to force re-build your manifest to generate and upload OG images for all photos:
```bash
 npm run build:manifest -- --force-manifest
```


### Use generated Cloudflare Pages Middleware

If you are using Cloudflare Pages to host your Afilmory, you can use the generated middleware to rewrite the OG image meta tags on photo pages to point to the generated OG images stored in your storage.

You only need to adjust the `storageURL` to your own OG image URL prefix and run `pnpm build`. This will generate the middleware code at `functions/_middleware.ts`. Then you can run `wrangler` to deploy your Cloudflare Pages site with the new middleware, it will automatically detect the middleware file:
```bash
npx wrangler pages deploy apps/web/dist/ --project-name=YOUR_PROJECT_NAME

# You should see outputs like:
# ...
# ✨ Uploading _routes.json
# ...
```

`storageURL` should be the origin/host where OG images are served (for example, a CDN or object storage domain without a path).

#### Cloudflare middleware vendor configuration

```ts
vendor: {
    type: 'cloudflare-middleware',
    storageURL: 'https://cdn.example.com', // OG images bucket/CDN origin
    siteConfigPath: './config.json', // optional, defaults to repo root config.json
}
```

- The middleware is written to `functions/_middleware.ts` at repo root.
- `storageURL` points to the base URL that serves `.afilmory/og-images/*`.
- `siteConfigPath` (optional) is resolved from the repo root when relative; defaults to `config.json` at the repo root.
- To verify: run `pnpm build`, check that `functions/_middleware.ts` is generated, and ensure the OG base inside matches your `storageURL`.



## How it works
- Hooks into the builder after each photo is processed.
- Loads site branding from `config.json` (or provided path) and falls back to simple defaults.
- Reuses the generated thumbnail (buffer or URL) as the image source, avoiding extra reads of the original file.
- Injects light EXIF/context (title, date, focal length, aperture, ISO, shutter speed, camera) into the card.
- Renders the card with `@afilmory/og-renderer` (Satori + resvg + sharp) using bundled fonts, then uploads the JPEG to storage.
- Caches uploads and public URLs within a single run so repeated work is skipped.

## Configuration
- `enable` (boolean): turn the plugin on/off. Defaults to `true`.
- `directory` (string): remote path prefix. Defaults to `.afilmory/og-images`.
- `storageConfig` (storage config): optional override; otherwise uses the builder's current storage.
- `contentType` (string): MIME type for uploads. Defaults to `image/jpeg`.
- `siteName` / `accentColor` (strings): optional overrides for branding.
- `siteConfigPath` (string): path to a site config JSON; defaults to `config.json` at the repo root (relative paths are resolved from the repo root).
- `vendor` (object): optional vendor automation. Current vendor types:
    - `cloudflare-middleware`: requires `storageURL`; optional `siteConfigPath` to override the repo-root `config.json` location. After the build finishes, it writes a Cloudflare Pages middleware to `functions/_middleware.ts` using `url` from `config.json` and `storageURL` for the OG host.

## Dependencies
- Uses fonts from `be/apps/core/src/modules/content/og/assets` (falls back to other repo paths). If fonts are missing, the plugin skips rendering for that run.
- Relies on the thumbnail storage plugin to provide in-memory thumbnail data when available; otherwise it will read a local/public or remote thumbnail URL.

## Notes
- Unsupported storage provider: `eagle` (the plugin disables itself in this case).
- Remote keys are cached; forcing (`isForceMode` or `isForceManifest`) re-renders and re-uploads.
- OG URLs are attached to `item.ogImageUrl` on the manifest entries.
