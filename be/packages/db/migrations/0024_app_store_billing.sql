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