#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
media="$here/../Afilmory/Fixtures/Media"
manifest="$here/../Afilmory/Fixtures/Payloads/photos-manifest.json"
thumbnails="$repo/apps/web/public/thumbnails"
originals="$repo/photos"

[ -d "$thumbnails" ] || { echo "Missing $thumbnails — run 'pnpm build:manifest' at the repo root first." >&2; exit 1; }
mkdir -p "$media"

ids=$(python3 -c 'import json,sys; print("\n".join(p["id"] for p in json.load(open(sys.argv[1]))["data"]))' "$manifest")
for id in $ids; do
  thumb="$thumbnails/$id.jpg"
  [ -f "$thumb" ] || { echo "Missing thumbnail for $id" >&2; exit 1; }
  sips -Z 480 -s format jpeg -s formatOptions 75 "$thumb" --out "$media/thumb-$id.jpg" >/dev/null
  original=$(ls "$originals/$id".* 2>/dev/null | head -1 || true)
  if [ -n "$original" ]; then
    sips -Z 1600 -s format jpeg -s formatOptions 78 "$original" --out "$media/$id.jpg" >/dev/null
  else
    sips -s format jpeg -s formatOptions 82 "$thumb" --out "$media/$id.jpg" >/dev/null
  fi
done

make_extras() {
  local pair name source out size id video
  for pair in innei:IMG_1401 birdline:DSC_6447 mayflowers:DSCF2850 nightwalker:IMG_20251111_002156 \
    shanyuren:DSCF4632 harbor:IMG_0030 stilllife:DSCF0436; do
    name="${pair%%:*}"
    source="$media/thumb-${pair#*:}.jpg"
    out="$media/avatar-$name.jpg"
    [ -f "$source" ] || { echo "Missing $source for avatar-$name" >&2; exit 1; }
    size=$(sips -g pixelWidth -g pixelHeight "$source" | awk '/pixel(Width|Height)/ {print $2}' | sort -n | head -1)
    sips -c "$size" "$size" "$source" --out "$out" >/dev/null
    sips -Z 160 -s format jpeg -s formatOptions 80 "$out" >/dev/null
  done

  for id in IMG_5469 IMG_5484; do
    video=""
    for source in "$repo/apps/web/public/photos/$id.mov" "$originals/$id.mov"; do
      [ -f "$source" ] && { video="$source"; break; }
    done
    [ -n "$video" ] || { echo "Missing Live Photo video $id.mov" >&2; exit 1; }
    rm -f "$media/$id.mov"
    if command -v ffmpeg >/dev/null; then
      ffmpeg -loglevel error -y -i "$video" \
        -vf "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)'" \
        -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -an -movflags +faststart "$media/$id.mov"
    else
      avconvert --source "$video" --preset Preset960x540 --output "$media/$id.mov" >/dev/null
    fi
  done
}
make_extras

echo "Fixture media ready in $media ($(ls "$media" | wc -l | tr -d ' ') files)"
