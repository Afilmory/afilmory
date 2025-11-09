CREATE TABLE "reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ref_key" text NOT NULL,
	"reaction" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;