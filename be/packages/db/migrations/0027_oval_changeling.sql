ALTER TABLE "tenant_cleanup_item" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_cleanup_item" ALTER COLUMN "tenant_slug" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_cleanup_batch" ADD COLUMN "subject_type" text DEFAULT 'tenant' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_cleanup_batch" ADD COLUMN "mode" text DEFAULT 'delete' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_cleanup_batch" ADD COLUMN "criteria" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "tenant_cleanup_batch" ADD COLUMN "suspended_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_cleanup_item" ADD COLUMN "subject_type" text DEFAULT 'tenant' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_cleanup_item" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "tenant_cleanup_item" ADD COLUMN "subject_label" text;--> statement-breakpoint
CREATE INDEX "idx_tenant_cleanup_item_sweep" ON "tenant_cleanup_item" USING btree ("status","completed_at");--> statement-breakpoint
ALTER TABLE "tenant_cleanup_item" ADD CONSTRAINT "uq_tenant_cleanup_item_batch_user" UNIQUE("batch_id","user_id");