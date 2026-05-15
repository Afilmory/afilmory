#! /bin/bash

set -e

# Seed config.json from the example template if not present (e.g. in CI).
# site.config.ts imports ./config.json — Vite 8's rolldown-based config bundler
# fails hard on missing modules, unlike Vite 7's esbuild loader.
if [ ! -f "config.json" ]; then
  cp config.example.json config.json
fi

# Clone demo photos from remote repo if local photos directory is empty
if [ ! -d "photos" ] || [ -z "$(ls -A photos 2>/dev/null)" ]; then
  echo "Fetching demo photos from https://github.com/Afilmory/demo-photos..."
  rm -rf photos
  git clone --depth 1 https://github.com/Afilmory/demo-photos photos
  rm -rf photos/.git
fi

mkdir -p ./apps/web/public/photos
cp -r photos/* ./apps/web/public/photos/

echo 'import { defineBuilderConfig } from "@afilmory/builder";

export default defineBuilderConfig(() => ({
  storage: {
    provider: "local",
    basePath: "./apps/web/public/photos",
    baseUrl: "/photos",
  },
}))' >builder.config.ts
