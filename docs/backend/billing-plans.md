# Billing Plans & Quota Strategy

This document tracks the current subscription plans, quota knobs, and the design approach that backs the enforcement code in `be/apps/core`.

## Goals

- Offer predictable resource guarantees (library size, upload size, sync object size, monthly processing) per plan.
- Decouple plan defaults from tenant-specific overrides so superadmins can hotfix limits without redeploys.
- Keep room for future self-serve subscriptions while allowing manual override flows during private beta.

## Plan Catalog (2024-xx-xx)

| Plan ID    | Label              | Availability          | Monthly Process Limit | Library Items | Upload Size (MB) | Sync Object (MB) | Notes |
|------------|--------------------|-----------------------|-----------------------|---------------|------------------|------------------|-------|
| `free`     | Free               | Default for new orgs  | 300                   | 500           | 20               | 50               | Soft cap for testing & hobby users. |
| `pro`      | Pro                | Upcoming public tier  | 1,000                 | 5,000         | 200              | 500              | Placeholder numbers; tune before launch. |
| `friend`   | Friend (Internal)  | Manual via superadmin | Unlimited (null)      | Unlimited     | Unlimited        | Unlimited        | Private plan for friends/internal testers; never exposed in product UI. |

> `Unlimited` == `null` in the DB schema, meaning enforcement is skipped for that quota dimension.

## Design Notes

1. **Plan definitions** live in `billing-plan.constants.ts`. Each entry carries human-friendly metadata for the super-admin dashboard plus a `quotas` object.
2. **Overrides** are stored under `system.billing.planOverrides`. This is a JSON blob keyed by plan id. It is parsed through zod (`SystemSettingService.getBillingPlanOverrides`) and merged in the billing plan service.
3. **Payment product mapping** lives in `system.billing.planProducts`. Each plan id can map to provider specific identifiers (e.g. `creemProductId`). Plans that require checkout (like `pro`) stay hidden until a product id is configured, which prevents exposing upgrade buttons in environments that are not ready.
3. **Tenant assignment** is tracked via `tenant.plan_id` and can only be changed by superadmins (see `/super-admin/tenants` backend+dashboard). The Friend plan is intentionally absent from any public selector.
4. **Quota enforcement** is performed in:
   - `PhotoAssetService` (manual upload size + library limit + monthly process allowance)
   - `DataSyncService` (sync object size, library headroom, monthly process allowance)
5. **Usage accounting** leverages `billing_usage_event` rows, so adding new quota dimensions is mostly a matter of emitting/aggregating the corresponding events.

Future ideas: surface plan metadata in the dashboard, wire plans to Stripe/Billing provider, and allow per-tenant overrides directly in the admin UI.
