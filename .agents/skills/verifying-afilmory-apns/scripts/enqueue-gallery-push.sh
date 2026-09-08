#!/usr/bin/env bash
set -euo pipefail

PGURL="${DATABASE_URL:-postgres://afilmory:afilmory@127.0.0.1:5432/afilmory}"
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
if [[ "$REDIS_URL" != redis://* ]]; then
  REDIS_URL="redis://${REDIS_URL}"
fi
IMAGE_URL="${IMAGE_URL:-}"
AVATAR_URL="${AVATAR_URL:-}"
GALLERY_SLUG="${GALLERY_SLUG:-}"
PHOTO_ID="${PHOTO_ID:-skill-proof}"
WAIT_SECONDS="${WAIT_SECONDS:-8}"
STREAM='queue:gallery-push-notifications:stream'

psql_cmd() {
  if command -v psql >/dev/null 2>&1; then
    psql "$PGURL" -At -v ON_ERROR_STOP=1 "$@"
  else
    docker exec -i afilmory_db psql -U afilmory -d afilmory -At -v ON_ERROR_STOP=1 "$@"
  fi
}

row="$(
  psql_cmd -v gallery_slug="${GALLERY_SLUG}" <<'SQL'
SELECT concat_ws(E'\t',
  d.id,
  t.id,
  t.slug,
  t.name)
FROM apns_device d
JOIN gallery_subscription s ON s.subscriber_user_id = d.user_id
JOIN tenant t ON t.id = s.target_tenant_id
WHERE d.enabled = true
  AND t.status = 'active'
  AND t.banned = false
  AND (:'gallery_slug' = '' OR t.slug = :'gallery_slug')
ORDER BY d.last_seen_at DESC
LIMIT 1;
SQL
)"

if [[ -z "$row" ]]; then
  echo 'No enabled APNs device with a gallery subscription.' >&2
  exit 1
fi

IFS=$'\t' read -r device_id tenant_id gallery_slug gallery_name <<<"$row"

if [[ -z "$IMAGE_URL" ]]; then
  IMAGE_URL="$(
    psql_cmd -v tenant_id="$tenant_id" <<'SQL'
SELECT manifest->'data'->>'thumbnailUrl'
FROM photo_asset
WHERE tenant_id = :'tenant_id'
  AND manifest->'data'->>'thumbnailUrl' LIKE 'https://%'
ORDER BY synced_at DESC
LIMIT 1;
SQL
  )"
  PHOTO_ID="$(
    psql_cmd -v tenant_id="$tenant_id" <<'SQL'
SELECT photo_id
FROM photo_asset
WHERE tenant_id = :'tenant_id'
  AND manifest->'data'->>'thumbnailUrl' LIKE 'https://%'
ORDER BY synced_at DESC
LIMIT 1;
SQL
  )"
fi

if [[ -z "$AVATAR_URL" ]]; then
  AVATAR_URL="$(
    psql_cmd -v tenant_id="$tenant_id" <<'SQL'
SELECT u.image
FROM tenant_membership m
JOIN auth_user u ON u.id = m.user_id
WHERE m.tenant_id = :'tenant_id'
  AND m.role = 'owner'
  AND m.status = 'active'
  AND u.image LIKE 'https://%'
LIMIT 1;
SQL
  )"
fi

delivery_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
event_id="skill-proof-$(date +%s)"
now_ms="$(python3 -c 'import time; print(int(time.time() * 1000))')"
image_json='null'
if [[ -n "${IMAGE_URL:-}" ]]; then
  image_json="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$IMAGE_URL")"
fi
avatar_json='null'
if [[ -n "${AVATAR_URL:-}" ]]; then
  avatar_json="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$AVATAR_URL")"
fi
photo_json='null'
if [[ -n "${PHOTO_ID:-}" ]]; then
  photo_json="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$PHOTO_ID")"
fi
gallery_name_json="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$gallery_name")"
gallery_slug_json="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$gallery_slug")"

payload="$(
  python3 - "$delivery_id" "$device_id" "$event_id" "$gallery_name_json" "$gallery_slug_json" "$image_json" "$avatar_json" "$photo_json" "$tenant_id" "$now_ms" <<'PY'
import json, sys
delivery_id, device_id, event_id, gallery_name, gallery_slug, image_url, avatar_url, photo_id, tenant_id, now_ms = sys.argv[1:]
now = int(now_ms)
body = {
  "deliveryId": delivery_id,
  "deviceId": device_id,
  "eventId": event_id,
  "galleryName": json.loads(gallery_name),
  "gallerySlug": json.loads(gallery_slug),
  "photoCount": 1,
  "targetTenantId": tenant_id,
}
image = json.loads(image_url)
avatar = json.loads(avatar_url)
photo = json.loads(photo_id)
if isinstance(image, str) and image:
  body["imageUrl"] = image
if isinstance(avatar, str) and avatar:
  body["avatarUrl"] = avatar
if isinstance(photo, str) and photo:
  body["photoId"] = photo
task = {
  "id": delivery_id,
  "name": "send-gallery-update",
  "payload": body,
  "attempts": 0,
  "runAt": now,
  "priority": 0,
  "enqueueTime": now,
}
print(json.dumps(task, separators=(",", ":")))
PY
)"

redis-cli -u "$REDIS_URL" XADD "$STREAM" '*' payload "$payload" >/dev/null

echo "Queued eventId=$event_id deviceId=$device_id gallery=$gallery_slug"
if [[ -z "${AVATAR_URL:-}" ]]; then
  echo 'No https owner avatar; compact leading circle will not be the gallery user.'
fi
if [[ -z "${IMAGE_URL:-}" ]]; then
  echo 'No https thumbnail; compact trailing image will be missing.'
fi

echo "Waiting ${WAIT_SECONDS}s for Core worker…"
sleep "$WAIT_SECONDS"

psql_cmd -v device_id="$device_id" <<'SQL'
SELECT concat('device enabled=', enabled, ' environment=', environment)
FROM apns_device
WHERE id = :'device_id';
SQL

echo "Evidence ID: $event_id"
