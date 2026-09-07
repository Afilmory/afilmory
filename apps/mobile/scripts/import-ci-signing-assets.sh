#!/usr/bin/env bash

set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID is required}"
: "${DIST_CERT_P12:?DIST_CERT_P12 is required}"
: "${DIST_CERT_PASSWORD:?DIST_CERT_PASSWORD is required}"
: "${APP_PROFILE_BASE64:?APP_PROFILE_BASE64 is required}"
: "${SHARE_PROFILE_BASE64:?SHARE_PROFILE_BASE64 is required}"
: "${WIDGETS_PROFILE_BASE64:?WIDGETS_PROFILE_BASE64 is required}"
: "${NOTIFICATION_PROFILE_BASE64:?NOTIFICATION_PROFILE_BASE64 is required}"

keychain_path="$RUNNER_TEMP/ci.keychain-db"
keychain_password="$(uuidgen)"
legacy_profiles_directory="$HOME/Library/MobileDevice/Provisioning Profiles"
xcode_profiles_directory="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"

security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 21600 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
security list-keychains -d user -s "$keychain_path" login.keychain-db

printf '%s' "$DIST_CERT_P12" | base64 --decode > "$RUNNER_TEMP/dist.p12"
security import "$RUNNER_TEMP/dist.p12" \
  -k "$keychain_path" \
  -P "$DIST_CERT_PASSWORD" \
  -T /usr/bin/codesign
security set-key-partition-list \
  -S apple-tool:,apple: \
  -s \
  -k "$keychain_password" \
  "$keychain_path" > /dev/null

signing_identities="$(security find-identity -v -p codesigning "$keychain_path")"
printf '%s\n' "$signing_identities"
if ! grep -q 'Apple Distribution:' <<< "$signing_identities"; then
  echo 'The imported PKCS#12 archive does not contain an available Apple Distribution identity.' >&2
  exit 1
fi

mkdir -p "$legacy_profiles_directory" "$xcode_profiles_directory"

install_profile() {
  local encoded_profile="$1"
  local expected_bundle_id="$2"
  local output_prefix="$3"
  local required_app_group="${4:-}"
  local source_path="$RUNNER_TEMP/${output_prefix}.mobileprovision"
  local plist_path="$RUNNER_TEMP/${output_prefix}.plist"

  printf '%s' "$encoded_profile" | base64 --decode > "$source_path"
  security cms -D -i "$source_path" > "$plist_path"

  local profile_uuid
  local profile_name
  local profile_team_id
  local profile_application_id
  local get_task_allow
  profile_uuid="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$plist_path")"
  profile_name="$(/usr/libexec/PlistBuddy -c 'Print :Name' "$plist_path")"
  profile_team_id="$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' "$plist_path")"
  profile_application_id="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$plist_path")"
  get_task_allow="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:get-task-allow' "$plist_path" 2>/dev/null || printf 'false')"

  if [[ ! "$profile_uuid" =~ ^[0-9A-Fa-f-]{36}$ ]]; then
    echo "Provisioning profile for $expected_bundle_id has an invalid UUID." >&2
    exit 1
  fi
  if [[ "$profile_team_id" != "$APPLE_TEAM_ID" ]]; then
    echo "Provisioning profile for $expected_bundle_id belongs to team $profile_team_id, expected $APPLE_TEAM_ID." >&2
    exit 1
  fi
  if [[ "$profile_application_id" != "$APPLE_TEAM_ID.$expected_bundle_id" ]]; then
    echo "Provisioning profile application identifier $profile_application_id does not match $expected_bundle_id." >&2
    exit 1
  fi
  if [[ "$get_task_allow" != 'false' ]]; then
    echo "Provisioning profile for $expected_bundle_id is a development profile; an App Store profile is required." >&2
    exit 1
  fi
  if /usr/libexec/PlistBuddy -c 'Print :ProvisionedDevices' "$plist_path" > /dev/null 2>&1; then
    echo "Provisioning profile for $expected_bundle_id contains registered devices; an App Store profile is required." >&2
    exit 1
  fi
  if /usr/libexec/PlistBuddy -c 'Print :ProvisionsAllDevices' "$plist_path" > /dev/null 2>&1; then
    echo "Provisioning profile for $expected_bundle_id is an enterprise profile; an App Store profile is required." >&2
    exit 1
  fi
  if [[ -n "$required_app_group" ]]; then
    local profile_app_groups
    profile_app_groups="$(
      /usr/libexec/PlistBuddy -c 'Print :Entitlements:com.apple.security.application-groups' "$plist_path" 2>/dev/null \
        | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
        || true
    )"
    if ! grep -Fxq "$required_app_group" <<< "$profile_app_groups"; then
      echo "Provisioning profile for $expected_bundle_id does not include required App Group $required_app_group." >&2
      exit 1
    fi
  fi

  cp "$source_path" "$legacy_profiles_directory/$profile_uuid.mobileprovision"
  cp "$source_path" "$xcode_profiles_directory/$profile_uuid.mobileprovision"
  {
    printf '%s_PROFILE_NAME=%s\n' "$output_prefix" "$profile_name"
    printf '%s_PROFILE_UUID=%s\n' "$output_prefix" "$profile_uuid"
  } >> "$GITHUB_ENV"
  printf 'Installed App Store profile %s for %s (%s).\n' "$profile_name" "$expected_bundle_id" "$profile_uuid"
}

install_profile "$APP_PROFILE_BASE64" 'app.afilmory' 'IOS_APP' 'group.app.afilmory'
install_profile "$SHARE_PROFILE_BASE64" 'app.afilmory.share' 'IOS_SHARE' 'group.app.afilmory'
install_profile "$WIDGETS_PROFILE_BASE64" 'app.afilmory.widgets' 'IOS_WIDGETS'
install_profile "$NOTIFICATION_PROFILE_BASE64" 'app.afilmory.notification' 'IOS_NOTIFICATION'
