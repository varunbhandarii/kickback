CREATE TABLE "raw_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "raw_events_purge_after_idx" ON "raw_events" USING btree ("purge_after");