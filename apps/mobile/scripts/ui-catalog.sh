#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Offline UI catalog: launches every catalog entry in fixture mode and screenshots it.

  scripts/ui-catalog.sh [filter...]

Environment:
  DEVICE       simulator name (default "iPhone 17 Pro") or UDID
  LANGS        space-separated app languages (default "en"; e.g. "en zh-Hans ja")
  MOTION       "full" (default), "reduce", or "both"
  TEXT_SIZE    UIContentSizeCategory name, e.g. UICTContentSizeCategoryAccessibilityXL
  DUO_POSTURE  force the Duo layout in Debug builds: "outer", "book" or "flat"
  SCREEN       simctl display to capture, e.g. 1 for the iPhone Duo outer display
  SKIP_BUILD=1 reuse the last build
  OUT          output directory (default .ui-catalog/<timestamp>)

Filters are id prefixes, e.g. "exhibition. detail.sheet".
USAGE
}
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 0; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE="${DEVICE:-iPhone 17 Pro}"
LANGS="${LANGS:-en}"
MOTION="${MOTION:-full}"
BUNDLE="app.afilmory.local"
DERIVED="$ROOT/.ui-catalog/DerivedData"
OUT="${OUT:-$ROOT/.ui-catalog/$(date +%Y%m%d-%H%M%S)}"
FILTERS=("$@")

UDID="$(xcrun simctl list devices available -j | python3 -c '
import json, sys
name = sys.argv[1]
devices = [d for runtime in json.load(sys.stdin)["devices"].values() for d in runtime]
match = [d for d in devices if d["udid"] == name] or [d for d in devices if d["name"] == name]
print(match[0]["udid"] if match else "")
' "$DEVICE")"
[[ -n "$UDID" ]] || { echo "No simulator named $DEVICE" >&2; exit 1; }

LOCK="/tmp/afilmory-ui-catalog.$UDID.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "Another catalog run holds $LOCK" >&2
  exit 1
fi
trap 'rmdir "$LOCK"' EXIT

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl ui "$UDID" appearance dark
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 >/dev/null 2>&1 || true

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  (cd "$ROOT" && pnpm native:generate >/dev/null)
  xcodebuild build -project "$ROOT/Afilmory.xcodeproj" -scheme "Afilmory Local" \
    -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath "$DERIVED" -quiet
fi
APP="$DERIVED/Build/Products/Debug-iphonesimulator/Afilmory.app"
xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
xcrun simctl install "$UDID" "$APP"

LISTING="$(xcrun simctl launch --console-pty "$UDID" "$BUNDLE" -catalog-list 2>/dev/null | tr -d '\r' | grep -E '^[a-z0-9]+\.[^	]+	' || true)"
[[ -n "$LISTING" ]] || { echo "Catalog listing is empty" >&2; exit 1; }

motions=()
case "$MOTION" in
  full) motions=(full) ;;
  reduce) motions=(reduce) ;;
  both) motions=(full reduce) ;;
esac

mkdir -p "$OUT"
INDEX="$OUT/index.html"
{
  echo '<!doctype html><meta charset="utf-8"><title>Afilmory UI catalog</title>'
  echo '<style>body{background:#0e0d0c;color:#ede9e3;font:13px -apple-system,sans-serif;margin:24px}figure{display:inline-block;margin:0 16px 24px 0;width:220px;vertical-align:top}img{width:220px;border-radius:18px;border:1px solid #2a2825}figcaption{font:11px ui-monospace,monospace;color:#b5b0a8;margin-top:6px;word-break:break-all}h2{font-weight:500;margin:28px 0 12px}</style>'
} > "$INDEX"

count=0
for lang in $LANGS; do
  for motion in "${motions[@]}"; do
    dir="$OUT/$lang-$motion"
    mkdir -p "$dir"
    echo "<h2>$lang · $motion</h2>" >> "$INDEX"
    while IFS=$'\t' read -r id scenario settle title; do
      if [[ ${#FILTERS[@]} -gt 0 ]]; then
        keep=0
        for f in "${FILTERS[@]}"; do [[ "$id" == "$f"* ]] && keep=1; done
        [[ $keep == 1 ]] || continue
      fi
      args=(-fixture.mode YES -fixture.scenario "$scenario" -catalog-open "$id"
        -AppleLanguages "($lang)" -AppleLocale "$lang")
      [[ "$motion" == "reduce" ]] && args+=(-fixture.reduceMotion YES)
      [[ -n "${TEXT_SIZE:-}" ]] && args+=(-UIPreferredContentSizeCategoryName "$TEXT_SIZE")
      [[ -n "${DUO_POSTURE:-}" ]] && args+=(-duo.posture "$DUO_POSTURE")
      xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
      xcrun simctl launch "$UDID" "$BUNDLE" "${args[@]}" >/dev/null
      sleep "$(python3 -c "print(max(1.5, float('$settle')))")"
      xcrun simctl io "$UDID" screenshot ${SCREEN:+--display="$SCREEN"} "$dir/$id.png" >/dev/null 2>&1
      echo "<figure><img src=\"$lang-$motion/$id.png\" loading=lazy><figcaption>$id · $scenario<br>$title</figcaption></figure>" >> "$INDEX"
      count=$((count + 1))
      echo "[$count] $lang $motion $id"
    done <<< "$LISTING"
  done
done
xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
echo "Wrote $count screenshots → $INDEX"
