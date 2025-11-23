CREATE TYPE "public"."tenant_domain_status" AS ENUM('pending', 'verified', 'disabled');--> statement-breakpoint
CREATE TABLE "tenant_domain" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"domain" text NOT NULL,
	"status" "tenant_domain_status" DEFAULT 'pending' NOT NULL,
	"verification_token" text NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tenant_domain_domain" UNIQUE("domain")
);
--> statement-breakpoint
ALTER TABLE "tenant_domain" ADD CONSTRAINT "tenant_domain_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tenant_domain_tenant" ON "tenant_domain" USING btree ("tenant_id");