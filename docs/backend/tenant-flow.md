# Tenant & OAuth Flow

This document describes how tenant resolution, Better Auth instances, and dashboard redirects tie together across the platform.

## Request Bootstrap

1. `RequestContextMiddleware` runs first on every request.
   - Calls `TenantContextResolver.resolve()` to populate `HttpContext.tenant`.
   - Calls `AuthProvider.getAuth()` so downstream handlers reuse the tenant-aware Better Auth instance.
2. `TenantContextResolver` inspects `x-forwarded-host`, `origin`, and `host` headers.
   - Extracts a slug via `tenant-host.utils.ts`.
   - Loads the tenant aggregate; if none exists, falls back to the placeholder tenant.
   - Always stores the original `requestedSlug` (even when placeholder) so downstream services know which workspace was requested.

## Auth Provider

- `AuthProvider` caches Better Auth instances by `protocol://host::slug::settings-hash`.
- The slug priority is:
  1. `HttpContext.tenant.requestedSlug`
  2. `HttpContext.tenant.slug`
  3. Derived from the host (when the context slug is still the placeholder).
- Redirect URIs are always built as `<OAuthGateway>/api/auth/callback/:provider?tenantSlug=...`.
- Because the requested slug participates in the cache key, the same Better Auth instance handles both the `/auth/social` request and the gateway callback, preserving OAuth state.

## System Settings & Gateway

- System settings only manage:
  - Registration flags
  - Base domain
  - OAuth gateway URL
  - Provider credentials
- No per-provider redirect URIs are stored; every provider points to the centralized gateway.
- `/auth/social/providers` reflects the enabled providers for the UI.

## Session Payload

`GET /auth/session` returns:

```ts
{
  user: BetterAuthUser,
  session: BetterAuthSession,
  tenant: {
    id: string,
    slug: string | null,      // Effective slug (requested slug if present, otherwise actual)
    isPlaceholder: boolean
  } | null
}
```

- When the resolver falls back to the placeholder tenant, `tenant.slug` still holds the requested subdomain, and `isPlaceholder` is `true`.
- Consumers simply check `tenant.isPlaceholder` to know whether they are in onboarding.

## Dashboard Behavior

- **Welcome flow** (`/platform/welcome`):
  - Locks the slug input to `window.location.hostname` via `getTenantSlugFromHost`.
  - Shows `TenantMissing` or `TenantRestricted` pages, but relies on backend redirects for actual auth.
- **Hooks (`usePageRedirect`)**:
  - If `tenant` is null or `isPlaceholder`, stay on welcome routes.
  - If `tenant.slug` exists and differs from the current host, sign out placeholder cookies and `window.location.replace(buildTenantUrl(tenant.slug))`.
  - Superadmin routes are gated separately.

## OAuth Happy Path

1. User opens `https://slug.example.com` (maybe not provisioned yet).
2. Resolver sets `requestedSlug = "slug"`, but tenant aggregate may still be the placeholder.
3. User clicks “Sign in with GitHub” → `/auth/social` uses `requestedSlug` and redirects via the OAuth gateway.
4. Gateway forwards the callback to `https://slug.example.com/api/auth/callback/github`.
5. Resolver again sets `requestedSlug = "slug"`; Better Auth instance cache hits, so `state` matches.
6. `/auth/session` returns `{ tenant: { slug: "slug", isPlaceholder: true } }` → dashboard stays on welcome, no cross-subdomain jump.
7. Once the tenant is provisioned, future sessions have `isPlaceholder: false`, and `usePageRedirect` ensures we land on the actual workspace subdomain.

## Key Guarantees

- Only a single `tenant.slug` crosses the API boundary; there are no ambiguous fields.
- Placeholder detection is a boolean (`isPlaceholder`).
- Better Auth instances survive OAuth handshakes regardless of tenant provisioning state.
