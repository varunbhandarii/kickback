import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const webhookEvents = pgTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawEvents = pgTable("raw_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  purgeAfter: timestamp("purge_after", { withTimezone: true }).notNull(),
}, (table) => [index("raw_events_purge_after_idx").on(table.purgeAfter)]);
