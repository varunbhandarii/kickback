CREATE TYPE "public"."backfill_status" AS ENUM('QUEUED', 'RUNNING', 'DONE', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."merchant_status" ADD VALUE 'ONBOARDING';--> statement-breakpoint
CREATE TABLE "backfill_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"kind" text DEFAULT 'BACKFILL' NOT NULL,
	"status" "backfill_status" DEFAULT 'QUEUED' NOT NULL,
	"window_from" timestamp with time zone NOT NULL,
	"window_to" timestamp with time zone NOT NULL,
	"windows_done" integer DEFAULT 0 NOT NULL,
	"rows_seen" integer DEFAULT 0 NOT NULL,
	"visits_created" integer DEFAULT 0 NOT NULL,
	"customers" integer DEFAULT 0 NOT NULL,
	"unrecognized" integer DEFAULT 0 NOT NULL,
	"refunds_applied" integer DEFAULT 0 NOT NULL,
	"checkpoint_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "history_events" (
	"merchant_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"kind" text NOT NULL,
	"customer_key" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "history_events_merchant_id_event_key_pk" PRIMARY KEY("merchant_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "merchant_users" (
	"user_id" text NOT NULL,
	"merchant_id" uuid NOT NULL,
	"role" text DEFAULT 'OWNER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_users_user_id_merchant_id_pk" PRIMARY KEY("user_id","merchant_id")
);
--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "merchant_id_in_paypal" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "tracking_id" uuid;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "status" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "last_status_check_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "scopes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "webhook_registered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "payments_receivable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "primary_email_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "last_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "category" text DEFAULT 'cafe' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "slug_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "purge_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "onboarding_step" text DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "stats_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "stats_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "backfill_runs" ADD CONSTRAINT "backfill_runs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_events" ADD CONSTRAINT "history_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_users" ADD CONSTRAINT "merchant_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_users" ADD CONSTRAINT "merchant_users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backfill_runs_queue_idx" ON "backfill_runs" USING btree ("status","heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "backfill_runs_active_idx" ON "backfill_runs" USING btree ("merchant_id") WHERE "backfill_runs"."status" in ('QUEUED','RUNNING');--> statement-breakpoint
CREATE INDEX "history_events_time_idx" ON "history_events" USING btree ("merchant_id","occurred_at");--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_tracking_id_unique" UNIQUE("tracking_id");
--> statement-breakpoint
UPDATE "connections" SET "status" = 'CONNECTED' WHERE "consent_status" = 'GRANTED';
--> statement-breakpoint
UPDATE "programs" SET "effective_from" = '1970-01-01T00:00:00Z' WHERE "provenance_json"->>'source' = 'demo-seed';
