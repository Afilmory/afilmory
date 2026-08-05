CREATE TYPE "public"."billing_entitlement_kind" AS ENUM('application_plan', 'managed_storage');--> statement-breakpoint
CREATE TYPE "public"."billing_entitlement_source" AS ENUM('subscription', 'manual');--> statement-breakpoint
CREATE TYPE "public"."billing_entitlement_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."billing_provider" AS ENUM('creem', 'app_store');--> statement-breakpoint
CREATE TYPE "public"."billing_provider_event_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."billing_subscription_status" AS ENUM('pending', 'active', 'grace_period', 'billing_retry', 'cancel_scheduled', 'expired', 'revoked', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."mobile_storage_handoff_status" AS ENUM('issued', 'exchanged', 'completed', 'expired');--> statement-breakpoint
CREATE TABLE "billing_entitlement" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" "billing_entitlement_kind" NOT NULL,
	"value" text NOT NULL,
	"source_type" "billing_entitlement_source" NOT NULL,
	"source_id" text NOT NULL,
	"status" "billing_entitlement_status" DEFAULT 'active' NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_billing_entitlement_source_kind" UNIQUE("source_type","source_id","kind")
);
--> statement-breakpoint
CREATE TABLE "billing_offer_product" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"external_product_id" text NOT NULL,
	"environment" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_billing_offer_product_provider_environment_external" UNIQUE("provider","environment","external_product_id")
);
--> statement-breakpoint
CREATE TABLE "billing_offer" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"application_plan_id" text,
	"storage_plan_id" text,
	"rank" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_provider_event" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"environment" text NOT NULL,
	"external_event_id" text NOT NULL,
	"external_subscription_id" text,
	"signed_at" timestamp,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_digest" text NOT NULL,
	"processing_status" "billing_provider_event_status" DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp,
	"error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_billing_provider_event_provider_environment_external" UNIQUE("provider","environment","external_event_id")
);
--> statement-breakpoint
CREATE TABLE "billing_subject" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"app_account_token" text NOT NULL,
	"billing_owner_user_id" text,
	"tombstoned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_billing_subject_app_account_token" UNIQUE("app_account_token")
);
--> statement-breakpoint
CREATE TABLE "billing_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"billing_owner_user_id" text,
	"offer_id" text NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"external_subscription_id" text NOT NULL,
	"original_transaction_id" text,
	"app_account_token" text,
	"environment" text NOT NULL,
	"status" "billing_subscription_status" DEFAULT 'pending' NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"provider_updated_at" timestamp,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_billing_subscription_provider_environment_external" UNIQUE("provider","environment","external_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "mobile_storage_handoff" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"capability_token_hash" text,
	"status" "mobile_storage_handoff_status" DEFAULT 'issued' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"capability_expires_at" timestamp,
	"exchanged_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_mobile_storage_handoff_token_hash" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "billing_entitlement" ADD CONSTRAINT "billing_entitlement_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_offer_product" ADD CONSTRAINT "billing_offer_product_offer_id_billing_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."billing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subject" ADD CONSTRAINT "billing_subject_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subject" ADD CONSTRAINT "billing_subject_billing_owner_user_id_auth_user_id_fk" FOREIGN KEY ("billing_owner_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription" ADD CONSTRAINT "billing_subscription_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription" ADD CONSTRAINT "billing_subscription_billing_owner_user_id_auth_user_id_fk" FOREIGN KEY ("billing_owner_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription" ADD CONSTRAINT "billing_subscription_offer_id_billing_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."billing_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_storage_handoff" ADD CONSTRAINT "mobile_storage_handoff_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_storage_handoff" ADD CONSTRAINT "mobile_storage_handoff_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_billing_entitlement_tenant_status" ON "billing_entitlement" USING btree ("tenant_id","status","kind");--> statement-breakpoint
CREATE INDEX "idx_billing_offer_product_offer" ON "billing_offer_product" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "idx_billing_provider_event_processing" ON "billing_provider_event" USING btree ("processing_status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_billing_subscription_provider_environment_original" ON "billing_subscription" USING btree ("provider","environment","original_transaction_id") WHERE "billing_subscription"."original_transaction_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_billing_subscription_tenant_status" ON "billing_subscription" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_billing_subscription_app_account_token" ON "billing_subscription" USING btree ("app_account_token");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mobile_storage_handoff_capability_token_hash" ON "mobile_storage_handoff" USING btree ("capability_token_hash") WHERE "mobile_storage_handoff"."capability_token_hash" is not null;--> statement-breakpoint
CREATE INDEX "idx_mobile_storage_handoff_tenant_status" ON "mobile_storage_handoff" USING btree ("tenant_id","status");
--> statement-breakpoint
INSERT INTO "billing_offer" (
	"id", "name", "description", "application_plan_id", "storage_plan_id", "rank", "is_active"
) VALUES
	('plan:pro', 'Afilmory Pro', 'Professional application plan.', 'pro', NULL, 100, true),
	('storage:managed-5gb', 'Managed Storage 5 GB', 'Afilmory-managed storage with 5 GB capacity.', NULL, 'managed-5gb', 10, true),
	('storage:managed-50gb', 'Managed Storage 50 GB', 'Afilmory-managed storage with 50 GB capacity.', NULL, 'managed-50gb', 20, true)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "billing_subject" ("tenant_id", "app_account_token")
SELECT "id", gen_random_uuid()::text
FROM "tenant"
ON CONFLICT ("tenant_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "billing_offer_product" (
	"id", "offer_id", "provider", "external_product_id", "environment"
)
SELECT
	'migration:plan:' || products.key || ':' || environments.environment,
	'plan:' || products.key,
	'creem'::"billing_provider",
	products.value ->> 'creemProductId',
	environments.environment
FROM "system_setting" settings
CROSS JOIN LATERAL jsonb_each(COALESCE(settings.value, '{}'::jsonb)) products
CROSS JOIN (VALUES ('legacy'), ('test'), ('production')) environments(environment)
WHERE settings.key = 'system.billing.planProducts'
	AND NULLIF(BTRIM(products.value ->> 'creemProductId'), '') IS NOT NULL
	AND EXISTS (SELECT 1 FROM "billing_offer" offer WHERE offer.id = 'plan:' || products.key)
ON CONFLICT ("provider", "environment", "external_product_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "billing_offer_product" (
	"id", "offer_id", "provider", "external_product_id", "environment"
)
SELECT
	'migration:storage:' || products.key || ':' || environments.environment,
	'storage:' || products.key,
	'creem'::"billing_provider",
	products.value ->> 'creemProductId',
	environments.environment
FROM "system_setting" settings
CROSS JOIN LATERAL jsonb_each(COALESCE(settings.value, '{}'::jsonb)) products
CROSS JOIN (VALUES ('legacy'), ('test'), ('production')) environments(environment)
WHERE settings.key = 'system.storage.planProducts'
	AND NULLIF(BTRIM(products.value ->> 'creemProductId'), '') IS NOT NULL
	AND EXISTS (SELECT 1 FROM "billing_offer" offer WHERE offer.id = 'storage:' || products.key)
ON CONFLICT ("provider", "environment", "external_product_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "billing_subscription" (
	"id",
	"tenant_id",
	"offer_id",
	"provider",
	"external_subscription_id",
	"environment",
	"status",
	"period_start",
	"period_end",
	"cancel_at_period_end",
	"provider_updated_at",
	"metadata",
	"created_at",
	"updated_at"
)
SELECT
	'creem:' || subscriptions.id,
	subscriptions.tenant_id,
	products.offer_id,
	'creem'::"billing_provider",
	COALESCE(NULLIF(subscriptions.creem_subscription_id, ''), 'record:' || subscriptions.id),
	'legacy',
	CASE
		WHEN subscriptions.cancel_at_period_end AND subscriptions.period_end > NOW() THEN 'cancel_scheduled'::"billing_subscription_status"
		WHEN LOWER(subscriptions.status) IN ('active', 'trialing', 'paid') THEN 'active'::"billing_subscription_status"
		WHEN LOWER(subscriptions.status) IN ('canceled', 'cancelled', 'expired') THEN 'expired'::"billing_subscription_status"
		ELSE 'pending'::"billing_subscription_status"
	END,
	subscriptions.period_start,
	subscriptions.period_end,
	subscriptions.cancel_at_period_end,
	subscriptions.updated_at,
	jsonb_build_object('legacyCreemRecordId', subscriptions.id, 'referenceId', subscriptions.reference_id),
	subscriptions.created_at,
	subscriptions.updated_at
FROM "creem_subscription" subscriptions
JOIN "billing_offer_product" products
	ON products.provider = 'creem'
	AND products.environment = 'legacy'
	AND products.external_product_id = subscriptions.product_id
WHERE subscriptions.tenant_id IS NOT NULL
ON CONFLICT ("provider", "environment", "external_subscription_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "billing_entitlement" (
	"id", "tenant_id", "kind", "value", "source_type", "source_id", "status", "rank", "starts_at", "ends_at"
)
SELECT
	'migration:subscription:application:' || subscriptions.id,
	subscriptions.tenant_id,
	'application_plan'::"billing_entitlement_kind",
	offers.application_plan_id,
	'subscription'::"billing_entitlement_source",
	subscriptions.id,
	'active'::"billing_entitlement_status",
	offers.rank,
	COALESCE(subscriptions.period_start, subscriptions.created_at),
	subscriptions.period_end
FROM "billing_subscription" subscriptions
JOIN "billing_offer" offers ON offers.id = subscriptions.offer_id
WHERE offers.application_plan_id IS NOT NULL
	AND subscriptions.status IN ('active', 'grace_period', 'cancel_scheduled')
	AND (subscriptions.period_end IS NULL OR subscriptions.period_end > NOW())
ON CONFLICT ("source_type", "source_id", "kind") DO NOTHING;
--> statement-breakpoint
INSERT INTO "billing_entitlement" (
	"id", "tenant_id", "kind", "value", "source_type", "source_id", "status", "rank", "starts_at", "ends_at"
)
SELECT
	'migration:subscription:storage:' || subscriptions.id,
	subscriptions.tenant_id,
	'managed_storage'::"billing_entitlement_kind",
	offers.storage_plan_id,
	'subscription'::"billing_entitlement_source",
	subscriptions.id,
	'active'::"billing_entitlement_status",
	offers.rank,
	COALESCE(subscriptions.period_start, subscriptions.created_at),
	subscriptions.period_end
FROM "billing_subscription" subscriptions
JOIN "billing_offer" offers ON offers.id = subscriptions.offer_id
WHERE offers.storage_plan_id IS NOT NULL
	AND subscriptions.status IN ('active', 'grace_period', 'cancel_scheduled')
	AND (subscriptions.period_end IS NULL OR subscriptions.period_end > NOW())
ON CONFLICT ("source_type", "source_id", "kind") DO NOTHING;
--> statement-breakpoint
INSERT INTO "billing_entitlement" (
	"id", "tenant_id", "kind", "value", "source_type", "source_id", "status", "rank"
)
SELECT
	'migration:manual:application:' || tenants.id,
	tenants.id,
	'application_plan'::"billing_entitlement_kind",
	tenants.plan_id,
	'manual'::"billing_entitlement_source",
	'migration:tenant:' || tenants.id,
	'active'::"billing_entitlement_status",
	100000
FROM "tenant" tenants
WHERE tenants.plan_id <> 'free'
	AND NOT EXISTS (
		SELECT 1
		FROM "billing_entitlement" entitlement
		WHERE entitlement.tenant_id = tenants.id
			AND entitlement.kind = 'application_plan'
			AND entitlement.value = tenants.plan_id
			AND entitlement.status = 'active'
	)
ON CONFLICT ("source_type", "source_id", "kind") DO NOTHING;
--> statement-breakpoint
INSERT INTO "billing_entitlement" (
	"id", "tenant_id", "kind", "value", "source_type", "source_id", "status", "rank"
)
SELECT
	'migration:manual:storage:' || tenants.id,
	tenants.id,
	'managed_storage'::"billing_entitlement_kind",
	tenants.storage_plan_id,
	'manual'::"billing_entitlement_source",
	'migration:tenant:' || tenants.id,
	'active'::"billing_entitlement_status",
	100000
FROM "tenant" tenants
WHERE tenants.storage_plan_id IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM "billing_entitlement" entitlement
		WHERE entitlement.tenant_id = tenants.id
			AND entitlement.kind = 'managed_storage'
			AND entitlement.value = tenants.storage_plan_id
			AND entitlement.status = 'active'
	)
ON CONFLICT ("source_type", "source_id", "kind") DO NOTHING;
