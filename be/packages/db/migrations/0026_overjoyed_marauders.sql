CREATE TYPE "public"."content_report_status" AS ENUM('pending', 'reviewed', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TABLE "content_report" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"comment_id" text,
	"reporter_user_id" text NOT NULL,
	"reported_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"content_snapshot" text NOT NULL,
	"status" "content_report_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_content_report_reporter_comment" UNIQUE("reporter_user_id","comment_id")
);
--> statement-breakpoint
CREATE TABLE "user_block" (
	"id" text PRIMARY KEY NOT NULL,
	"blocker_user_id" text NOT NULL,
	"blocked_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_block_pair" UNIQUE("blocker_user_id","blocked_user_id")
);
--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_reporter_user_id_auth_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_reported_user_id_auth_user_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocker_user_id_auth_user_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocked_user_id_auth_user_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_content_report_tenant_status" ON "content_report" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_content_report_reported_user" ON "content_report" USING btree ("reported_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_block_blocker" ON "user_block" USING btree ("blocker_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_block_blocked" ON "user_block" USING btree ("blocked_user_id","created_at");