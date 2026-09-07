---
name: verifying-afilmory-apns
description: Use when verifying Afilmory gallery push notifications through local Core and an iOS Simulator, or when diagnosing missing banners, TopicDisallowed, POSIX 163 NSE launch failure, BadDeviceToken, APNs-disabled logs, text-only notifications, compact banners that still show the app icon instead of the gallery owner's avatar, or when Afilmory Local, simctl push, or unit tests are being treated as end-to-end proof.
---

# Verifying Afilmory APNs

Prove this boundary:

`local Core → APNs sandbox → iOS Simulator (app.afilmory) → NSE mutates content → banner, tap opens that gallery`

Unit tests, Redis enqueue, an APNs 200, `simctl push`, or a fake-token `BadDeviceToken` are not completion.

**Completion**

- Core: no `TaskDropError` / `APNs request failed`; `apns_device` still `enabled=true` `environment=development`.
- Visible Simulator banner (AX: `AFILMORY, …, <gallery name>, 刚刚发布了…` / `Just published…`).
- Tap opens Explore on that gallery.
- If `avatarUrl` / `imageUrl` were public HTTPS: NSE donates `INSendMessageIntent` with the **gallery owner's** avatar as `INPerson.image` (leading circle) and attaches the photo as `UNNotificationAttachment` (`ThumbnailHiddenKey` false). Do not put the published photo on the sender. SpringBoard should mutate content (`attachmentCount=1`, `Rendered avatar image: YES`). Compact proof on Simulator is owner avatar left, not the app icon, not the published photo. Long-press expansion must show the JPEG. iOS 26.5 Simulator compact banners have not rendered the trailing attachment thumb even without Communication enrichment — confirm trailing media on a physical device.

Identify the run by `skill-proof-*` event ids. Start `pnpm --filter @afilmory/mobile native:memory-guard` before Simulator launch.

## Hard stops

- **Never use `Afilmory Local` / `app.afilmory.local` / `pnpm ios:local`.** No `aps-environment`; `supportsPushNotifications` is false.
- **Never use the Release `Afilmory` scheme for local Core.** It talks to `api.afilmory.art` and reports APNs `production`.
- **Never force `CODE_SIGN_IDENTITY=Apple Development` on Simulator, and never `AD_HOC_CODE_SIGNING_ALLOWED=NO`.** iOS 26.5 Simulator SDK requires ad hoc for the host; a Development-signed NSE beside an adhoc host dies with POSIX **163** (`Launchd job spawn failed` → `Did not mutate content`).
- **Never print, commit, or persist `APNS_PRIVATE_KEY` / `.p8`.**
- **Never truncate `apns_device` or `gallery_subscription`.**

## Why the stock schemes fail

| Scheme | Bundle | Debug? | Push | Local API override |
|---|---|---|---|---|
| `Afilmory Local` | `app.afilmory.local` | yes | no | yes |
| `Afilmory` Release | `app.afilmory` | no | yes | no |

Local Core + sandbox APNs needs Debug (Lab override + `APNsRegistrationEnvironment.development`) **and** production variant/bundle/entitlements. That mix is this skill's sandbox client, not a committed scheme.

## Prerequisites

- Booted Simulator (this skill's script defaults to **iPhone 17 Pro**), Xcode, AXe, `redis-cli`. Postgres is `afilmory_db` on `5432`; if `psql` is missing, `docker exec afilmory_db psql -U afilmory -d afilmory`. Probe Redis — it may be host `127.0.0.1:6379`, not a compose service named `afilmory_redis`.
- Core on `127.0.0.1:1841` via `pnpm dev:be` with `APNS_TEAM_ID=KAMM5N88X3`, `APNS_KEY_ID=VUQAGR3F6U`, `APNS_BUNDLE_ID=app.afilmory`, `APNS_PRIVATE_KEY` from 1Password `op://Apple Developer/Afilmory APNs Sandbox`. Confirm by **absence** of `APNs delivery is disabled because provider credentials are not configured.` Never echo the key.
- That key is **topic-specific**. The 1Password item name does not grant topic `app.afilmory`. In Apple Developer → Keys, the key must list `app.afilmory`. After adding a topic, **restart Core** — the HTTP/2 session can keep returning `TopicDisallowed`.
- A fake token `BadDeviceToken` only proves request auth, not topic authorization.
- Two local users: Simulator subscriber, publisher who owns a gallery the subscriber follows.

## Simulator signing

`scripts/build-sandbox-client.sh` **must `clean build`**. Incremental derived data can keep a cached Apple Development NSE next to a rebuilt adhoc host.

After build, both `Afilmory.app` and `PlugIns/AfilmoryNotification.appex` must be `Signature=adhoc` / `TeamIdentifier=not set`. Yohaku Simulator apps are the same. Empty `codesign -d --entitlements :-` on the adhoc host is not a failure — check `Afilmory.app-Simulated.xcent` for `aps-environment=development` and `com.apple.developer.usernotifications.communication`.

Do not post-sign the Simulator app with a Development identity; SpringBoard then denies launch.

## Fast triage

| Symptom | First check |
|---|---|
| No token / no iOS prompt | Built `Afilmory Local` |
| Token registers, Core never queues | Core log `APNs delivery is disabled` |
| `TopicDisallowed` | Key topics omit `app.afilmory`, or Core not restarted after a topic grant |
| Queued, then POSIX 163 / `Did not mutate` | NSE not adhoc; `clean build` and reinstall |
| Queued, device `enabled=false` | `BadDeviceToken`; sandbox client, not Release |
| Compact banner still uses the app icon | NSE did not `updating(from: INSendMessageIntent)`; check communication entitlement, POSIX 163, and `avatarUrl` |
| Compact leading circle is the published photo | NSE used `imageUrl` as `INPerson.image`; sender image must be `avatarUrl` (tenant owner `auth_user.image`) |
| Banner, tap does nothing useful | Payload `route` / `gallerySlug` / `photoId`; NSE is unrelated |

## Workflow

1. **Inspect** branch, dirty files, booted UDID, Core port, Postgres/Redis mappings. Do not assume `5432`/`6379`/`1841`.
2. **Start Core** with APNs vars. Disable warning must be absent. Hit `/api/health`, not `/api` (the latter can hang on static-web).
3. **Build the sandbox client:** `bash .agents/skills/verifying-afilmory-apns/scripts/build-sandbox-client.sh`. Scheme `Afilmory Local` / Debug + `scripts/sandbox-client.xcconfig` → bundle `app.afilmory`, variant `production`. Refuse if installed bundle is `app.afilmory.local` or either binary is not adhoc.
4. **Point it at local Core.** Launch `app.afilmory`. Open Developer Lab with `xcrun simctl openurl <udid> afilmory:///dev` (DEBUG) or Studio tab five times. Set **Local** (`http://localhost:1841`), Probe HTTP 200, sign in as the subscriber. Requests must hit `localhost:1841`, not `api.afilmory.art`.
5. **Bind push.** Subscribe to the publisher's gallery. Accept the notification prompt. Require `PUT /push-devices` 200 and `apns_device` `enabled=true` `environment=development`. Do not print `device_token`. `simctl privacy grant notifications` is often `Operation not permitted` — use the in-app prompt.
6. **Deliver.** Background to SpringBoard. Prefer a real Studio upload (`enqueueGalleryPublished`). Or `IMAGE_URL='https://…jpg' AVATAR_URL='https://…jpg' bash .agents/skills/verifying-afilmory-apns/scripts/enqueue-gallery-push.sh`. Use **distinct** HTTPS images so the leading owner avatar and trailing photo cannot be confused. HTTP URLs are dropped. Start `axe tap --label 'AFILMORY, 现在, <gallery>, 刚刚发布了 1 张新照片。' --wait-timeout 12` **before** enqueue so the banner is tappable; it dismisses in a few seconds. Labels include a relative time that changes (`现在` → `1分钟前`).
7. **Proof.** Core `Task completed` without drop. Device still enabled. Banner AX. Compact banner: owner avatar left (camera badge if a photo was attached). Long-press expansion shows the JPEG. A trailing compact thumb is expected on device; iOS 26.5 Simulator has not shown one even for attachment-only notifications. Tap compact banner (not Notification Center swipe, which becomes a leading swipe-to-clear). `BadDeviceToken` on a stale row is not a failed run if the fresh Simulator row delivered.

Invalid App Store profiles after App ID capability edits are unrelated; sandbox verification does not use them.

## Failure guide

| Symptom | Check |
|---|---|
| `supportsPushNotifications` never registers | Sandbox xcconfig not applied; still `app.afilmory.local` |
| `APNs delivery is disabled` | Incomplete `APNS_*` in Core env |
| `TopicDisallowed` | Keys UI topics; restart `pnpm dev:be` |
| POSIX 163 / NSE never launches | Host vs NSE codesign mismatch; `clean build` |
| `BadDeviceToken` then disabled | Release Production client, or stale token |
| NSE launched, compact still shows app icon | Communication entitlement missing, `donate`/`updating(from:)` fell back, or no `avatarUrl` |
| Compact left is the published photo | `INPerson.image` was built from `imageUrl`; it must be the owner `avatarUrl` |
| Text-only and `Did not mutate` | NSE missing from the sandbox build, or spawn failed |
| `imageUrl` / `avatarUrl` HTTP | rustfs HTTP is dropped; use public HTTPS |
| Tap opens the wrong gallery | `gallerySlug` / deep link `photo` query |
| Build script exits 141 | `grep -q` + `pipefail`; use `require_adhoc` as in the script |

## Cleanup

Stop only processes started for the run. Leave `afilmory_db` volumes and host Redis. Delete `apps/mobile/.derived-apns-sandbox` if created. Do not reset API environment on unrelated Simulator installs.

## Rationalizations

| Excuse | Reality |
|---|---|
| "Local has no APNs, so skip Simulator" | Build the sandbox client. Local scheme is the wrong binary. |
| "PushNotificationTests passed" | Payload/deep-link coverage, not APNs. |
| "`simctl push` showed a banner" | Never leaves the Mac. Does not prove Core → APNs. |
| "`ios:production` is the push app" | Release cannot retarget local Core; reports `production`. |
| "Queued in Redis is enough" | Worker can drop or disable the device after that. |
| "Fake token `BadDeviceToken` means the topic is allowed" | Auth only. Topic check can still be `TopicDisallowed`. |
| "1Password item is named Afilmory APNs Sandbox" | Check the Key's topic list. This key is shared with Yohaku. |
| "codesign entitlements dump is empty, so push is off" | Adhoc Simulator; read `*-Simulated.xcent`. |
| "Force Apple Development so entitlements stick" | Mixed signing → POSIX 163. Stay adhoc on Simulator. |
| "Compact banner has no trailing thumb, so NSE failed" | On iOS 26.5 Simulator, SpringBoard still reports `attachmentCount=1` and long-press shows the JPEG. Trailing compact thumbs have not rendered with or without Communication enrichment. Confirm on a physical device before changing NSE again. |
| "Put the photo on the leading avatar so the compact banner has an image" | Wrong layout. Leading circle is the gallery user (`avatarUrl`). The published photo is the attachment, not `INPerson.image`. |
| "Incremental build is enough after a signing experiment" | `clean build` or the cached Development NSE comes back. |
