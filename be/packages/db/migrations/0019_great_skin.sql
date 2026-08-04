CREATE TYPE "public"."account_deletion_stage" AS ENUM('revoke_providers', 'resolve_billing', 'delete_storage', 'finalize_database', 'completed');--> statement-breakpoint
CREATE TYPE "public"."account_deletion_status" AS ENUM('requested', 'processing', 'retryable_failure', 'manual_intervention', 'completed');--> statement-breakpoint
CREATE TYPE "public"."apple_authorization_status" AS ENUM('active', 'revoked', 'revocation_failed');--> statement-breakpoint
CREATE TABLE "account_deletion_request" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_user_id" text,
	"status_token_hash" text NOT NULL,
	"status" "account_deletion_status" DEFAULT 'requested' NOT NULL,
	"stage" "account_deletion_stage" DEFAULT 'revoke_providers' NOT NULL,
	"impact_snapshot" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"last_error_code" text,
	"access_revoked_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_account_deletion_status_token_hash" UNIQUE("status_token_hash")
);
--> statement-breakpoint
CREATE TABLE "apple_authorization" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"subject" text NOT NULL,
	"client_id" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"authorization_code_hash" text,
	"status" "apple_authorization_status" DEFAULT 'active' NOT NULL,
	"last_revocation_error" text,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_apple_authorization_account" UNIQUE("account_id"),
	CONSTRAINT "uq_apple_authorization_subject_client" UNIQUE("subject","client_id")
);
--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "deletion_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "apple_authorization" ADD CONSTRAINT "apple_authorization_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_authorization" ADD CONSTRAINT "apple_authorization_account_id_auth_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_account_deletion_active_user" ON "account_deletion_request" USING btree ("subject_user_id") WHERE "account_deletion_request"."subject_user_id" is not null and "account_deletion_request"."status" <> 'completed';--> statement-breakpoint
CREATE INDEX "idx_account_deletion_retry" ON "account_deletion_request" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_apple_authorization_code_hash" ON "apple_authorization" USING btree ("authorization_code_hash");--> statement-breakpoint
CREATE INDEX "idx_apple_authorization_user_status" ON "apple_authorization" USING btree ("user_id","status");--> statement-breakpoint
UPDATE "comment" AS "child"
SET "parent_id" = NULL
WHERE "child"."parent_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM "comment" AS "parent"
		WHERE "parent"."id" = "child"."parent_id"
	);--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "fk_comment_parent" FOREIGN KEY ("parent_id") REFERENCES "public"."comment"("id") ON DELETE set null ON UPDATE no action;
