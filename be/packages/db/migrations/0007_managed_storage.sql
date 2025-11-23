CREATE TABLE "managed_storage_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"provider_key" text NOT NULL,
	"total_bytes" bigint DEFAULT 0 NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "managed_storage_usage" ADD CONSTRAINT "managed_storage_usage_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_managed_storage_usage_tenant_recorded" ON "managed_storage_usage" USING btree ("tenant_id","recorded_at");
--> statement-breakpoint
CREATE INDEX "idx_managed_storage_usage_provider" ON "managed_storage_usage" USING btree ("provider_key");
--> statement-breakpoint
CREATE TABLE "managed_storage_file_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"provider_key" text NOT NULL,
	"storage_key" text NOT NULL,
	"storage_provider" text,
	"size" bigint,
	"content_type" text,
	"etag" text,
	"reference_type" text,
	"reference_id" text,
	"metadata" jsonb DEFAULT null,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_managed_storage_file_ref_tenant_key" UNIQUE("tenant_id","storage_key")
);
--> statement-breakpoint
ALTER TABLE "managed_storage_file_reference" ADD CONSTRAINT "managed_storage_file_reference_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_managed_storage_file_ref_provider" ON "managed_storage_file_reference" USING btree ("provider_key");
--> statement-breakpoint
CREATE INDEX "idx_managed_storage_file_ref_reference" ON "managed_storage_file_reference" USING btree ("reference_type","reference_id");
