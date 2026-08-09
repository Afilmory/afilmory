# iOS Release

CI: `.github/workflows/mobile-testflight.yml` — XcodeGen → SwiftPM resolution → archive → TestFlight upload.
Trigger: push a `mobile-v*` tag, or run manually via workflow_dispatch.

## Local simulator variant

The Xcode project exposes two independently installable schemes from the same Swift sources.

| Variant | Command | Bundle ID | Default API |
| --- | --- | --- | --- |
| Production | `pnpm --filter @afilmory/mobile ios:production` | `app.afilmory` | `https://api.afilmory.art` |
| Local | `pnpm --filter @afilmory/mobile ios:local` | `app.afilmory.local` | `http://localhost:1841` |

Both commands synchronize localization resources, regenerate `Afilmory.xcodeproj`, and resolve the
SwiftPM dependency graph. The Local scheme carries only its default Keychain access group and
disables Sign in with Apple, push registration, shared-upload handoff, Live Activity creation, and
StoreKit sponsorship. Use the local password account for development testing.

Run `pnpm --filter @afilmory/mobile native:test` for the Swift behavior suite.

## One-time setup

### Apple Developer portal ([developer.apple.com](https://developer.apple.com/account))

1. **Identifiers → +** — register App ID `app.afilmory` (explicit) and enable
   **Sign in with Apple** and **Push Notifications**.
2. **Certificates** — create an **Apple Distribution** certificate. Easiest via Xcode:
   Settings → Accounts → team → Manage Certificates → + → Apple Distribution.
   Then export it from Keychain Access as `.p12` with a password.

No provisioning profiles to create: CI archives with automatic signing
(`-allowProvisioningUpdates` + the ASC API key), so Xcode registers the App ID and
fetches a profile for every target — app and extensions alike — at build time.

### Sign in with Apple backend

1. Create a Sign in with Apple key for the same Apple Developer team and record
   its Team ID and Key ID.
2. Store the raw `.p8` value as the deployment secret `APPLE_PRIVATE_KEY`.
3. Configure the non-secret App Bundle ID (`app.afilmory`), Team ID, and Key ID
   in Super Admin → System Settings. A Services ID is optional and is needed only
   when Apple login is also enabled for the web dashboard.
4. Apply the latest Core database migration before enabling the provider. It
   creates the encrypted Apple authorization and durable account-deletion tables.

### App Store Connect ([appstoreconnect.apple.com](https://appstoreconnect.apple.com))

4. **My Apps → + → New App** — platform iOS, bundle ID `app.afilmory`,
   name `Afilmory`, SKU `afilmory-ios`.
5. **Users and Access → Integrations → App Store Connect API → Team Keys → +** —
   role **App Manager** (required: a Developer-role key cannot create App IDs or
   provisioning profiles, so the archive step would fail). Note the Key ID and
   Issuer ID, download the `.p8` (downloadable only once).

### One-time sponsorship purchase

The mobile profile sheet loads this product from StoreKit and always displays
the App Store's localized price. Configure the product before testing or
submitting a build:

| Field | Value |
| --- | --- |
| Type | Consumable |
| Reference name | Afilmory Sponsor |
| Product ID | `app.afilmory.sponsor` |
| US price | USD 2.99 |

1. Complete the Paid Apps Agreement, banking, and tax setup in App Store
   Connect.
2. Under **Afilmory → Monetization → In-App Purchases**, create the consumable
   product above and add its required localization and review screenshot.
3. Test the purchase with a Sandbox Apple Account on a signed development or TestFlight build.
4. Submit the first in-app purchase together with the app version that exposes
   it, and describe the profile-sheet sponsorship path in App Review notes.

### GitHub secrets (repo → Settings → Secrets → Actions)

| Secret | Value |
| --- | --- |
| `IOS_DIST_CERT_P12` | `base64 -i dist.p12 \| pbcopy` |
| `IOS_DIST_CERT_PASSWORD` | password chosen when exporting the `.p12` |
| `ASC_KEY_ID` | API key ID |
| `ASC_ISSUER_ID` | API key issuer ID |
| `ASC_API_KEY_P8` | raw contents of the `.p8` file |

### First submission only

- App Privacy declarations (account data: email/name via sign-in; photos the user uploads).
- Privacy policy URL + support URL (App Information).
- Screenshots: 6.9" iPhone set (capture on iPhone Pro Max simulator).
- App Review: provide the seeded email/password review account, representative
  gallery navigation notes, and a separately documented spare account. Reset or
  reseed the account after any review pass that exercises in-app deletion.

## Per release

1. Bump `MARKETING_VERSION` in `project.yml` (the build number is seeded from the CI run number,
   then Xcode auto-bumps past any build already on ASC via
   `manageAppVersionAndBuildNumber` — collisions with manual Xcode uploads are fine).
2. Tag and push:

   ```bash
   git tag mobile-v1.0 && git push origin mobile-v1.0
   ```

3. Wait for the workflow, then check App Store Connect → TestFlight
   (processing takes 5–30 min). Export compliance is pre-declared
   (`usesNonExemptEncryption: false`), so builds go live for internal testers
   without questions.
4. Ship to external TestFlight testers first; submit for App Store review from
   the ASC UI once stable.
