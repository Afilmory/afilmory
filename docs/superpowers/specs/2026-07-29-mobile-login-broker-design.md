# Mobile Login Broker (slug-free OAuth) — Design

**Date:** 2026-07-29
**Scope:** Remove the workspace-slug input from mobile sign-in. The app OAuths once against a neutral broker host; the backend maps the provider identity to its tenant globally and issues a normal tenant session.
**Supersedes:** the slug-input sign-in flow in `2026-07-29-mobile-oauth-own-gallery-design.md` (everything else there stands).

## Approach

A **login broker** on the reserved host `api.afilmory.art` (slug `api` is in `RESERVED_SLUGS`, so it never resolves to a tenant and can never be claimed):

1. App calls `POST https://api.afilmory.art/api/auth/sign-in/social` — no slug, just the provider. The existing controller wraps gateway state with `tenantSlug = requestedSlug = 'api'`, so the OAuth gateway forwards the provider callback back to `api.afilmory.art`. **No gateway changes.**
2. `AuthProvider.getAuth()` detects the broker slug and builds a dedicated Better Auth instance with a **broker adapter**:
   - `account` lookups run **globally** (no tenant filter). If the same provider identity exists in several tenants, the **most recently updated account wins** (v1 behavior; a picker can come later if this ever bites).
   - `user` / `session` lookups are global too (ids and session tokens are globally unique).
   - `user` / `account` **creation is blocked** with a clear error — sign-up stays a web-only, tenant-scoped flow.
   - Session create hook stamps the session with the **found user's `tenantId`**, so the resulting session is a first-class tenant session (valid later on `<slug>.afilmory.art` for guarded endpoints).
   - Social-only: `emailAndPassword` disabled; plugins: `expo()` only.
3. `GET api.afilmory.art/api/auth/session` already re-resolves the tenant from `user.tenantId` when the host has none — the app learns its gallery slug from the session response. Sign-out on the broker host also works (global session lookup).

Isolation stays intact: only the identity→tenant mapping is global; photos, settings, sessions-on-tenant-hosts, and every guarded route keep the existing tenant scoping.

## Backend changes (`be/apps/core`)

- `modules/platform/auth/broker-adapter.ts` — `brokerDrizzleAdapter`: plain drizzle adapter + global account `findOne` via sorted `findMany(updatedAt desc, limit 1)` + create-blocking for `user`/`account`.
- `auth.provider.ts` — `MOBILE_AUTH_BROKER_SLUG = 'api'`; `getAuth()` branches to `createAuthForBroker()`; broker BA config as above (same social providers/gateway redirect, same trustedOrigins incl. `afilmory://`, `skipStateCookieCheck`, session-create hook loads `authUsers.tenantId` by `session.userId`).

## Mobile changes

- `modules/auth/authClient.ts`: single fixed client at `${API_BASE_URL}/auth` — per-slug factory deleted.
- `modules/auth/sessionStore.ts`: `signInWithProvider(provider)` (no slug arg); slug SecureStore persistence deleted — the cookie is the credential, the slug always comes from the session response.
- `modules/auth/api.ts`: `fetchSession(cookie)` against the broker host.
- `SignInSection`: slug input and host hint removed — just the two provider buttons.

## Error cases

- Identity not linked to any workspace → broker blocks creation; app surfaces "No workspace is linked to this account. Create your gallery on the web first."
- Pending/placeholder tenant → unchanged handling (Photos tab "Workspace pending" state).

## Verification

App-side type-check / lint / bundle. End-to-end after deploy: sign in with GitHub/Google without typing anything; Photos tab shows own gallery; relaunch keeps session; sign out works. Regression: web dashboard login untouched (broker branch only activates on the `api` slug).
