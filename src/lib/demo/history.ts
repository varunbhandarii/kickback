import { randomUUID, createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { captures, customers, orders, visits } from "@/db/schema";
import { getEnv } from "../env";
import { loadMerchant } from "../merchants";
import { customerKey } from "../crypto/tenant";
import { lockMerchant } from "../ledger/locks";
import { audit } from "../audit";
import { prior } from "../ai/designer/context";
export function randomSource(seed: string) {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
}
export function syntheticVisits(options: {
  category: string;
  customers: number;
  days: number;
  seed: string;
  now: Date;
  menuPrices?: number[];
}) {
  const random = randomSource(options.seed),
    mean =
      options.category === "salon"
        ? 1.2
        : options.category === "bakery"
          ? 3
          : 6,
    rows: {
      customer: number;
      at: Date;
      amountCents: number;
      wallet: "PAYPAL" | "VENMO";
    }[] = [];
  for (let customer = 0; customer < options.customers; customer++) {
    const lambda = (mean / 2) * (-Math.log(random()) - Math.log(random()));
    let product = 1,
      count = 0;
    do {
      count++;
      product *= random();
    } while (product > Math.exp(-lambda) && count < options.days);
    count--;
    const used = new Set<number>();
    for (let i = 0; i < count; i++) {
      let day: number;
      do {
        day = 1 + Math.floor(random() * options.days);
        const weekday = new Date(+options.now - day * 86400000).getUTCDay(),
          weight =
            options.category === "bakery"
              ? weekday === 0 || weekday === 6
                ? 1
                : 0.6
              : options.category === "salon"
                ? weekday === 6
                  ? 1
                  : weekday === 0
                    ? 0.2
                    : 0.7
                : weekday === 0 || weekday === 6
                  ? 0.65
                  : 1;
        if (random() > weight) continue;
        if (!used.has(day)) break;
      } while (true);
      used.add(day);
      const at = new Date(+options.now - day * 86400000);
      at.setUTCHours(
        (options.category === "salon"
          ? 18
          : options.category === "bakery"
            ? 14
            : 13) + Math.floor(random() * 3),
        Math.floor(random() * 60),
        0,
        0,
      );
      const ticket =
        options.menuPrices?.[
          Math.floor(random() * (options.menuPrices?.length ?? 0))
        ] ?? prior(options.category).ticketCents;
      rows.push({
        customer,
        at,
        amountCents: Math.max(
          100,
          Math.round(ticket * (0.85 + random() * 0.3)),
        ),
        wallet: random() < 0.25 ? "VENMO" : "PAYPAL",
      });
    }
  }
  return rows.toSorted((a, b) => +a.at - +b.at || a.customer - b.customer);
}
export async function seedHistory(
  slug: string,
  category: string,
  count = 150,
  days = 90,
  clear = false,
  seed: string = randomUUID(),
) {
  const env = getEnv();
  if (env.KICKBACK_ENV !== "sandbox" || !env.DEMO_MODE)
    throw new Error("Synthetic history requires sandbox demo mode");
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 500 ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 90 ||
    !["cafe", "salon", "bakery", "other"].includes(category)
  )
    throw new Error("Invalid fixture options");
  const merchant = await loadMerchant(slug, true);
  if (!merchant) throw new Error("Business not found");
  return getDb().transaction(async (tx) => {
    await lockMerchant(tx, merchant.id);
    if (clear) {
      const fixture = await tx
        .select({ id: visits.id, key: visits.customerKey })
        .from(visits)
        .where(
          and(eq(visits.merchantId, merchant.id), eq(visits.source, "FIXTURE")),
        );
      if (fixture.length) {
        const ids = fixture.map((v) => v.id),
          fixtureOrders = await tx
            .select({ orderId: captures.orderId })
            .from(captures)
            .where(
              and(
                eq(captures.merchantId, merchant.id),
                inArray(captures.visitId, ids),
              ),
            );
        await tx
          .delete(captures)
          .where(
            and(
              eq(captures.merchantId, merchant.id),
              inArray(captures.visitId, ids),
            ),
          );
        if (fixtureOrders.length)
          await tx.delete(orders).where(
            and(
              eq(orders.merchantId, merchant.id),
              inArray(
                orders.id,
                fixtureOrders.map((r) => r.orderId),
              ),
              eq(orders.status, "FIXTURE"),
            ),
          );
        await tx
          .delete(visits)
          .where(
            and(
              eq(visits.merchantId, merchant.id),
              eq(visits.source, "FIXTURE"),
            ),
          );
        for (const key of new Set(fixture.map((v) => v.key))) {
          const [remaining] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(visits)
            .where(
              and(
                eq(visits.merchantId, merchant.id),
                eq(visits.customerKey, key),
              ),
            );
          if (!remaining.n)
            await tx
              .delete(customers)
              .where(
                and(
                  eq(customers.merchantId, merchant.id),
                  eq(customers.key, key),
                ),
              );
        }
      }
      await audit(
        tx,
        merchant.id,
        "demo_history.cleared",
        merchant.id,
        { visits: fixture.length },
        "operator",
      );
      return { cleared: fixture.length, visits: 0, customers: 0 };
    }
    const [existing] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(visits)
      .where(
        and(eq(visits.merchantId, merchant.id), eq(visits.source, "FIXTURE")),
      );
    if (existing.n)
      return { visits: existing.n, customers: 0, alreadySeeded: true };
    const rows = syntheticVisits({
        category,
        customers: count,
        days,
        seed,
        now: new Date(),
        menuPrices: merchant.menu.map((i) => i.priceCents),
      }),
      byCustomer = new Map<number, typeof rows>();
    for (const row of rows) {
      const group = byCustomer.get(row.customer) ?? [];
      group.push(row);
      byCustomer.set(row.customer, group);
    }
    for (const [customer, group] of byCustomer) {
      const key = customerKey(merchant.id, "fixture:" + seed + ":" + customer);
      await tx
        .insert(customers)
        .values({
          merchantId: merchant.id,
          key,
          label: "Demo " + (customer + 1),
          wallets: [...new Set(group.map((v) => v.wallet))],
          firstSeen: group[0].at,
          lastSeen: group.at(-1)!.at,
          status: "EXCLUDED",
        });
      for (const row of group) {
        const id = "fx:" + randomUUID(),
          [visit] = await tx
            .insert(visits)
            .values({
              merchantId: merchant.id,
              customerKey: key,
              startedAt: row.at,
              lastCaptureAt: row.at,
              amountCents: row.amountCents,
              status: "COMPLETED",
              source: "FIXTURE",
            })
            .returning();
        await tx
          .insert(orders)
          .values({
            id,
            merchantId: merchant.id,
            requestId: randomUUID(),
            wallet: row.wallet,
            amountCents: row.amountCents,
            status: "FIXTURE",
            createdAt: row.at,
          });
        await tx
          .insert(captures)
          .values({
            id,
            merchantId: merchant.id,
            orderId: id,
            visitId: visit.id,
            customerKey: key,
            wallet: row.wallet,
            amountCents: row.amountCents,
            refundableCents: 0,
            status: "FIXTURE",
            capturedAt: row.at,
          });
      }
    }
    await audit(
      tx,
      merchant.id,
      "demo_history.seeded",
      merchant.id,
      { visits: rows.length, customers: byCustomer.size },
      "operator",
    );
    return {
      visits: rows.length,
      customers: byCustomer.size,
      synthetic: true,
      neverRefundable: true,
    };
  });
}
