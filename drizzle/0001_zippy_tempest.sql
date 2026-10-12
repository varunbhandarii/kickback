CREATE TYPE "public"."connection_mode" AS ENUM('PARTNER', 'BYO');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('OK', 'FROZEN', 'EXCLUDED');--> statement-breakpoint
CREATE TYPE "public"."merchant_status" AS ENUM('ACTIVE', 'PAUSED', 'DISCONNECTED');--> statement-breakpoint
CREATE TYPE "public"."program_status" AS ENUM('DRAFT', 'ACTIVE', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."reward_rail" AS ENUM('REFUND', 'PAYOUT');--> statement-breakpoint
CREATE TYPE "public"."reward_state" AS ENUM('EARNED', 'SCHEDULED', 'SENDING', 'SENT', 'CONFIRMED', 'FAILED', 'CANCELLED', 'OFFSET', 'HELD', 'DEFERRED');--> statement-breakpoint
CREATE TYPE "public"."reward_tier" AS ENUM('INSTANT', 'DELAYED', 'REVIEW');--> statement-breakpoint
CREATE TYPE "public"."visit_source" AS ENUM('PAY_PAGE', 'WEBHOOK', 'REPLAY', 'BACKFILL');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('PENDING', 'COMPLETED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."wallet_type" AS ENUM('PAYPAL', 'VENMO');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject" text NOT NULL,
	"details_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captures" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"visit_id" uuid,
	"customer_key" text,
	"wallet" "wallet_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"refundable_cents" integer NOT NULL,
	"foreign_refunded_cents" integer DEFAULT 0 NOT NULL,
	"refund_count" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "captures_refundable_bound" CHECK ("captures"."refundable_cents" >= 0 AND "captures"."refundable_cents" <= "captures"."amount_cents")
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"mode" "connection_mode" NOT NULL,
	"merchant_id_in_paypal" text NOT NULL,
	"client_id" text,
	"client_secret_enc" "bytea",
	"granted_features" text[] DEFAULT '{}' NOT NULL,
	"consent_status" text DEFAULT 'UNKNOWN' NOT NULL,
	"webhook_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"merchant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"wallets" text[] DEFAULT '{}' NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"status" "customer_status" DEFAULT 'OK' NOT NULL,
	"label" text,
	"progress_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_merchant_id_key_pk" PRIMARY KEY("merchant_id","key")
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"capture_id" text NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_key" text NOT NULL,
	"status" text NOT NULL,
	"outcome" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"tz" text DEFAULT 'America/New_York' NOT NULL,
	"status" "merchant_status" DEFAULT 'ACTIVE' NOT NULL,
	"rewards_paused" boolean DEFAULT false NOT NULL,
	"menu_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "offsets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_key" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"remaining_cents" integer NOT NULL,
	"kind" text DEFAULT 'DEBIT' NOT NULL,
	"source_reward_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offsets_remaining_bound" CHECK ("offsets"."remaining_cents" >= 0 AND "offsets"."remaining_cents" <= "offsets"."amount_cents")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"wallet" "wallet_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"item_id" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_positive_amount" CHECK ("orders"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"spec_json" jsonb NOT NULL,
	"status" "program_status" DEFAULT 'DRAFT' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"provenance_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"capture_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"applied_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_key" text NOT NULL,
	"program_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"capture_id" text,
	"amount_cents" integer NOT NULL,
	"offset_applied_cents" integer DEFAULT 0 NOT NULL,
	"rail" "reward_rail" DEFAULT 'REFUND' NOT NULL,
	"state" "reward_state" DEFAULT 'SCHEDULED' NOT NULL,
	"tier" "reward_tier" DEFAULT 'INSTANT' NOT NULL,
	"request_id" uuid NOT NULL,
	"refund_id" text,
	"note" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"settle_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "rewards_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "rewards_refund_id_unique" UNIQUE("refund_id"),
	CONSTRAINT "rewards_positive_amount" CHECK ("rewards"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_key" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_capture_at" timestamp with time zone NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "visit_status" NOT NULL,
	"source" "visit_source" NOT NULL,
	CONSTRAINT "visits_nonnegative_amount" CHECK ("visits"."amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offsets" ADD CONSTRAINT "offsets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offsets" ADD CONSTRAINT "offsets_source_reward_id_rewards_id_fk" FOREIGN KEY ("source_reward_id") REFERENCES "public"."rewards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_merchant_id_customer_key_customers_merchant_id_key_fk" FOREIGN KEY ("merchant_id","customer_key") REFERENCES "public"."customers"("merchant_id","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "captures_visit_idx" ON "captures" USING btree ("visit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offsets_source_kind_idx" ON "offsets" USING btree ("source_reward_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_request_idx" ON "orders" USING btree ("merchant_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_version_idx" ON "programs" USING btree ("merchant_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_active_idx" ON "programs" USING btree ("merchant_id") WHERE "programs"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "rewards_visit_idx" ON "rewards" USING btree ("visit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rewards_live_visit_idx" ON "rewards" USING btree ("visit_id") WHERE "rewards"."state" <> 'CANCELLED';--> statement-breakpoint
CREATE INDEX "rewards_sweep_idx" ON "rewards" USING btree ("settle_at") WHERE "rewards"."state" = 'SCHEDULED';--> statement-breakpoint
CREATE INDEX "visits_customer_time_idx" ON "visits" USING btree ("merchant_id","customer_key","started_at");
--> statement-breakpoint
UPDATE webhook_events SET processed_at = received_at WHERE processed_at IS NULL;
