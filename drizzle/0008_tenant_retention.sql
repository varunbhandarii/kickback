ALTER TABLE "merchants" ALTER COLUMN "status" SET DEFAULT 'ONBOARDING';--> statement-breakpoint
ALTER TABLE "refund_receipts" ADD COLUMN "merchant_id" uuid;--> statement-breakpoint
ALTER TABLE "refund_receipts" ADD CONSTRAINT "refund_receipts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;