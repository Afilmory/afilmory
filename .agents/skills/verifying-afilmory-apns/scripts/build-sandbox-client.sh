#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
MOBILE="$ROOT/apps/mobile"
XCCONFIG="$(cd "$(dirname "$0")" && pwd)/sandbox-client.xcconfig"
DEVICE="${1:-iPhone 17 Pro}"
DESTINATION="platform=iOS Simulator,name=${DEVICE}"

cd "$MOBILE"
pnpm native:generate

xcodebuild -project Afilmory.xcodeproj \
  -scheme 'Afilmory Local' \
  -configuration Debug \
  -xcconfig "$XCCONFIG" \
  -destination "$DESTINATION" \
  -derivedDataPath "$MOBILE/.derived-apns-sandbox" \
  DEVELOPMENT_TEAM=KAMM5N88X3 \
  clean build

APP="$MOBILE/.derived-apns-sandbox/Build/Products/Debug-iphonesimulator/Afilmory.app"
test -d "$APP"
/usr/libexec/PlistBuddy -c 'Print :AfilmoryAppVariant' "$APP/Info.plist" | grep -qx production
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist" | grep -qx app.afilmory
SIM_XCENT="$MOBILE/.derived-apns-sandbox/Build/Intermediates.noindex/Afilmory.build/Debug-iphonesimulator/Afilmory.build/Afilmory.app-Simulated.xcent"
grep -q 'aps-environment' "$SIM_XCENT"

require_adhoc() {
  local output
  output="$(codesign -dv --verbose=4 "$1" 2>&1 || true)"
  [[ "$output" == *"Signature=adhoc"* ]]
}
# Incremental rebuild can leave a Development-signed NSE beside an adhoc host; SpringBoard then fails spawn with POSIX 163.
require_adhoc "$APP"
require_adhoc "$APP/PlugIns/AfilmoryNotification.appex"

UDID="$(xcrun simctl list devices booted | grep -F "$DEVICE (" | grep -oE '[0-9A-F-]{36}' | head -1)"
if [[ -z "$UDID" ]]; then
  xcrun simctl boot "$DEVICE"
  UDID="$(xcrun simctl list devices | grep -F "$DEVICE (" | grep -oE '[0-9A-F-]{36}' | head -1)"
fi

xcrun simctl install "$UDID" "$APP"
printf 'Installed app.afilmory on %s (%s)\n' "$DEVICE" "$UDID"
