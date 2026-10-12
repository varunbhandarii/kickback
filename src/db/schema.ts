import { sql } from "drizzle-orm";
import { boolean, check, customType, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true });
const bytes = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const merchantStatus = pgEnum("merchant_status", ["ACTIVE", "PAUSED", "DISCONNECTED"]);
export const connectionMode = pgEnum("connection_mode", ["PARTNER", "BYO"]);
export const programStatus = pgEnum("program_status", ["DRAFT", "ACTIVE", "RETIRED"]);
export const customerStatus = pgEnum("customer_status", ["OK", "FROZEN", "EXCLUDED"]);
export const walletType = pgEnum("wallet_type", ["PAYPAL", "VENMO"]);
export const visitStatus = pgEnum("visit_status", ["PENDING", "COMPLETED", "VOID"]);
export const visitSource = pgEnum("visit_source", ["PAY_PAGE", "WEBHOOK", "REPLAY", "BACKFILL"]);
export const rewardState = pgEnum("reward_state", ["EARNED", "SCHEDULED", "SENDING", "SENT", "CONFIRMED", "FAILED", "CANCELLED", "OFFSET", "HELD", "DEFERRED"]);
export const rewardTier = pgEnum("reward_tier", ["INSTANT", "DELAYED", "REVIEW"]);
export const rewardRail = pgEnum("reward_rail", ["REFUND", "PAYOUT"]);

export type MenuItem = { id: string; name: string; priceCents: number };
export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(), slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(), tz: text("tz").notNull().default("America/New_York"),
  status: merchantStatus("status").notNull().default("ACTIVE"), rewardsPaused: boolean("rewards_paused").notNull().default(false),
  menu: jsonb("menu_json").$type<MenuItem[]>().notNull().default([]), createdAt: at("created_at").notNull().defaultNow(),
});
export const connections = pgTable("connections", {
  merchantId: uuid("merchant_id").primaryKey().references(() => merchants.id), mode: connectionMode("mode").notNull(),
  merchantIdInPayPal: text("merchant_id_in_paypal").notNull(), clientId: text("client_id"), clientSecretEnc: bytes("client_secret_enc"),
  grantedFeatures: text("granted_features").array().notNull().default([]), consentStatus: text("consent_status").notNull().default("UNKNOWN"),
  webhookId: text("webhook_id"), updatedAt: at("updated_at").notNull().defaultNow(),
});
export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(), merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
  version: integer("version").notNull(), spec: jsonb("spec_json").notNull(), status: programStatus("status").notNull().default("DRAFT"),
  effectiveFrom: at("effective_from").notNull().defaultNow(), retiredAt: at("retired_at"), provenance: jsonb("provenance_json").notNull().default({}),
}, (t) => [uniqueIndex("programs_version_idx").on(t.merchantId, t.version), uniqueIndex("programs_active_idx").on(t.merchantId).where(sql`${t.status} = 'ACTIVE'`)]);
export const customers = pgTable("customers", {
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id), key: text("key").notNull(), wallets: text("wallets").array().notNull().default([]),
  firstSeen: at("first_seen").notNull(), lastSeen: at("last_seen").notNull(), status: customerStatus("status").notNull().default("OK"),
  label: text("label"), progress: jsonb("progress_json").notNull().default({}), updatedAt: at("updated_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.merchantId, t.key] })]);
export const orders = pgTable("orders", {
  id: text("id").primaryKey(), merchantId: uuid("merchant_id").notNull().references(() => merchants.id), requestId: uuid("request_id").notNull(),
  wallet: walletType("wallet").notNull(), amountCents: integer("amount_cents").notNull(), itemId: text("item_id"), status: text("status").notNull(), createdAt: at("created_at").notNull().defaultNow(),
  demoVisitAt: at("demo_visit_at"),
}, (t) => [uniqueIndex("orders_request_idx").on(t.merchantId, t.requestId), check("orders_positive_amount", sql`${t.amountCents} > 0`)]);
export const visits = pgTable("visits", {
  id: uuid("id").primaryKey().defaultRandom(), merchantId: uuid("merchant_id").notNull().references(() => merchants.id), customerKey: text("customer_key").notNull(),
  startedAt: at("started_at").notNull(), lastCaptureAt: at("last_capture_at").notNull(), amountCents: integer("amount_cents").notNull(),
  status: visitStatus("status").notNull(), source: visitSource("source").notNull(),
}, (t) => [index("visits_customer_time_idx").on(t.merchantId, t.customerKey, t.startedAt), foreignKey({ columns: [t.merchantId, t.customerKey], foreignColumns: [customers.merchantId, customers.key] }), check("visits_nonnegative_amount", sql`${t.amountCents} >= 0`)]);
export const captures = pgTable("captures", {
  id: text("id").primaryKey(), merchantId: uuid("merchant_id").notNull().references(() => merchants.id), orderId: text("order_id").notNull().references(() => orders.id),
  visitId: uuid("visit_id").references(() => visits.id), customerKey: text("customer_key"), wallet: walletType("wallet").notNull(),
  amountCents: integer("amount_cents").notNull(), feeCents: integer("fee_cents").notNull().default(0), refundableCents: integer("refundable_cents").notNull(),
  foreignRefundedCents: integer("foreign_refunded_cents").notNull().default(0), refundCount: integer("refund_count").notNull().default(0),
  status: text("status").notNull(), capturedAt: at("captured_at").notNull(), updatedAt: at("updated_at").notNull().defaultNow(),
}, (t) => [index("captures_visit_idx").on(t.visitId), check("captures_refundable_bound", sql`${t.refundableCents} >= 0 AND ${t.refundableCents} <= ${t.amountCents}`)]);
export const rewards = pgTable("rewards", {
  id: uuid("id").primaryKey().defaultRandom(), merchantId: uuid("merchant_id").notNull().references(() => merchants.id), customerKey: text("customer_key").notNull(),
  programId: uuid("program_id").notNull().references(() => programs.id), visitId: uuid("visit_id").notNull().references(() => visits.id), captureId: text("capture_id").references(() => captures.id),
  basisVisitIds: uuid("basis_visit_ids").array().notNull().default([]),
  amountCents: integer("amount_cents").notNull(), offsetAppliedCents: integer("offset_applied_cents").notNull().default(0), rail: rewardRail("rail").notNull().default("REFUND"),
  state: rewardState("state").notNull().default("SCHEDULED"), tier: rewardTier("tier").notNull().default("INSTANT"), requestId: uuid("request_id").notNull().unique(),
  refundId: text("refund_id").unique(), note: text("note").notNull(), attempts: integer("attempts").notNull().default(0), settleAt: at("settle_at").notNull().defaultNow(),
  lockedAt: at("locked_at"), lockedBy: text("locked_by"), lastError: text("last_error"), reason: text("reason"), createdAt: at("created_at").notNull().defaultNow(), sentAt: at("sent_at"), confirmedAt: at("confirmed_at"),
  sendUncertain: boolean("send_uncertain").notNull().default(false),
}, (t) => [uniqueIndex("rewards_visit_idx").on(t.visitId), uniqueIndex("rewards_live_visit_idx").on(t.visitId).where(sql`${t.state} <> 'CANCELLED'`), index("rewards_sweep_idx").on(t.settleAt).where(sql`${t.state} = 'SCHEDULED'`), check("rewards_positive_amount", sql`${t.amountCents} > 0`),check("rewards_offset_bound",sql`${t.offsetAppliedCents} >= 0 and ${t.offsetAppliedCents} <= ${t.amountCents}`)]);
export const offsets = pgTable("offsets", {
  id: uuid("id").primaryKey().defaultRandom(), merchantId: uuid("merchant_id").notNull().references(() => merchants.id), customerKey: text("customer_key").notNull(),
  amountCents: integer("amount_cents").notNull(), remainingCents: integer("remaining_cents").notNull(), kind: text("kind").notNull().default("DEBIT"),
  sourceRewardId: uuid("source_reward_id").notNull().references(() => rewards.id), createdAt: at("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("offsets_source_kind_idx").on(t.sourceRewardId, t.kind), check("offsets_remaining_bound", sql`${t.remainingCents} >= 0 AND ${t.remainingCents} <= ${t.amountCents}`)]);

export const webhookEvents = pgTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: at("processed_at"), processingAt: at("processing_at"), attempts: integer("attempts").notNull().default(0), lastError: text("last_error"),
});

export const rawEvents = pgTable("raw_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  purgeAfter: timestamp("purge_after", { withTimezone: true }).notNull(),
}, (table) => [index("raw_events_purge_after_idx").on(table.purgeAfter)]);

export const refundReceipts = pgTable("refund_receipts", {
  id: text("id").primaryKey(), captureId: text("capture_id").notNull(), amountCents: integer("amount_cents").notNull(),
  kind: text("kind").notNull(), status: text("status").notNull(), appliedAt: at("applied_at"), receivedAt: at("received_at").notNull().defaultNow(),
});
export const disputes = pgTable("disputes", {
  id: text("id").primaryKey(), captureId: text("capture_id").notNull(), merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
  customerKey: text("customer_key").notNull(), status: text("status").notNull(), outcome: text("outcome"), updatedAt: at("updated_at").notNull().defaultNow(),
});
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(), merchantId: uuid("merchant_id").references(() => merchants.id), actor: text("actor").notNull(),
  action: text("action").notNull(), subject: text("subject").notNull(), details: jsonb("details_json").notNull().default({}), at: at("at").notNull().defaultNow(),
});
export const settings = pgTable("settings", { key: text("key").primaryKey(), value: jsonb("value").notNull(), updatedAt: at("updated_at").notNull().defaultNow() });
