# Mobile OAuth (GitHub + Google) + Own-Gallery Home — Design

**Date:** 2026-07-29
**Scope:** Two phases delivered together. Phase 1: social sign-in from the RN app against the multi-tenant Better Auth backend. Phase 2: signed-in home tab becomes the user's own gallery masonry; the discovery feed moves to Explore.
**Builds on:** `2026-07-29-mobile-gallery-detail-design.md`.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Providers | GitHub + Google (the only two the backend configures) |
| App credentials | **None** — client id/secret live in backend system settings; redirect URI is fixed to the OAuth gateway; the app never talks to providers directly |
| Signed-in home | Home tab = own gallery masonry; discovery feed moves to Explore tab |
| Tenant addressing | User types their workspace slug at sign-in; all auth runs against `https://<slug>.afilmory.art` (generic hosts cannot authenticate — tenant resolution is host-based) |

## Backend facts this design relies on (verified 2026-07-29)

- Better Auth `1.6.19` in `be/apps/core`, per-request tenant-aware instance keyed by host slug. Social flow already gateway-wrapped (`auth.afilmory.art`) with HMAC state + `skipStateCookieCheck` — mobile's cross-context hop needs no gateway changes.
- `GET /api/auth/session` (custom route) returns `{user, session, tenant}` — the user→gallery mapping. Responses are snake_cased by `ResponseTransformInterceptor`.
- Missing for mobile: `expo()` plugin, `afilmory://` in `trustedOrigins`, and the BA passthrough routes are snake_cased.
- `@better-auth/expo@1.6.19` matches the server pin; its peers need `expo-web-browser` and `expo-network` added to the app (linking/constants already present).

## Phase 1 — Backend changes (`be/apps/core`)

1. Add `@better-auth/expo` and register `expo()` in the Better Auth plugin array (`auth.provider.ts`).
2. `trustedOrigins`: append `afilmory://` (all environments).
3. `@BypassResponseTransform()` on the two BA passthrough handlers in `auth.controller.ts` so native BA routes return Better Auth's own JSON. Custom routes (`/auth/session`, `/auth/social`, …) keep the snake_case transform — dashboard consumes those with its own `camelCaseKeys` and is unaffected; regression-check dashboard usages of passthrough routes before landing.

Deploy is required before end-to-end verification.

## Phase 1 — Mobile auth (`modules/auth/`)

```
modules/auth/
├── authClient.ts     # createAuthClient(better-auth/react) + expoClient plugin per slug;
│                     #   module-level current client, recreated when slug changes
├── sessionStore.ts   # useSyncExternalStore module store: status signedOut|loading|signedIn,
│                     #   session {user, tenant}, slug; hydrate / signIn / signOut
├── api.ts            # fetchSession(slug): GET https://<slug>.afilmory.art/api/auth/session
│                     #   with authClient cookie → camelCaseKeys → SessionInfo
├── case.ts           # small recursive snake→camel util
├── types.ts          # SessionUser, SessionTenant, SessionInfo
└── SignInSection.tsx # slug input + GitHub/Google buttons (lives in Settings screen)
```

- Flow: user enters slug → `signIn.social({provider, callbackURL: '/'})` via the expo client (scheme `afilmory`, storage `expo-secure-store`) → system browser → gateway → tenant host → deep link back; expo client persists the session cookie. Then fetch `/api/auth/session`, persist slug, store `{user, tenant}`.
- Transport: session cookie only (no bearer plugin). `api/auth.ts` singleton is repurposed to hold the cookie string; `api/client.ts` sends `Cookie` instead of `Authorization` for tenant-host calls.
- Launch hydration: read slug from SecureStore → recreate client (cookie auto-loads from its storage) → validate via `/api/auth/session`; invalid/expired → signedOut.
- Pending/placeholder tenant (`tenant.status !== 'active'`): show a "workspace not finished registering" note + sign out; no onboarding flow in the app.
- Sign out: BA sign-out via client, clear slug + cookie storage, reset store.

## Phase 2 — Home restructure

- Tab 1 route `(tabs)/galleries` → `(tabs)/photos`, label **Photos** (icon unchanged). Signed in: own gallery masonry (reuse `useGalleryManifest` with session slug), no back button, sign-out lives in Settings. Signed out: centered sign-in hero (button jumps to Settings tab).
- Tab 2 **Explore** replaces its placeholder with the discovery feed: `(tabs)/explore/index` = featured-galleries list (moved `GalleriesScreen`), `(tabs)/explore/[slug]` = gallery detail (moved route; `modules/galleries` domain code stays put). Icon: `safari` / `safari.fill`, md `explore`.
- Tab 3 **Settings**: signed out → `SignInSection`; signed in → account row (avatar, name, gallery name/slug) + Sign out.
- `/` redirect → `/photos`. `pages.ts` registry updated accordingly.

## Verification

- App-side: type-check, scoped lint, bundle export.
- End-to-end (after user deploys backend): simulator real OAuth run — sign in with GitHub or Google in the system browser, deep link returns, session hydrates, home shows own gallery; relaunch keeps the session; sign out returns to hero.
- Dashboard regression: confirm no dashboard code depends on snake_cased passthrough responses.

## Out of Scope

- Tenant onboarding/registration from the app, email+password login, photo viewer, bearer-token transport.
