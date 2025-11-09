CREATE TABLE "tenant_auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "tenant_auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tenant_auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'guest' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"username" text,
	"display_username" text,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires_at" timestamp,
	CONSTRAINT "uq_tenant_auth_user_tenant_email" UNIQUE("tenant_id","email")
);
--> statement-breakpoint
ALTER TABLE "tenant_auth_account" ADD CONSTRAINT "tenant_auth_account_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_auth_account" ADD CONSTRAINT "tenant_auth_account_user_id_tenant_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."tenant_auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_auth_session" ADD CONSTRAINT "tenant_auth_session_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_auth_session" ADD CONSTRAINT "tenant_auth_session_user_id_tenant_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."tenant_auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_auth_user" ADD CONSTRAINT "tenant_auth_user_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reactions_tenant_ref_key" ON "reactions" USING btree ("tenant_id","ref_key");--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "uq_reactions_tenant_ref_key" UNIQUE("tenant_id","ref_key");