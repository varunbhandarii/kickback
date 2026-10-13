import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backfillRuns,
  captures,
  connections,
  customers,
  historyEvents,
  orders,
  programs,
  rawEvents,
  refundReceipts,
  rewards,
  visits,
} from "@/db/schema";
import { setupDb, resetDb, teardownDb, fixture, purchase } from "./helpers/db";
import {
  classify,
  historyWindows,
  type SearchRow,
} from "@/lib/history/classify";
import { runBackfill, startBackfill } from "@/lib/history/worker";
import { customerKey } from "@/lib/crypto/tenant";
const at = new Date("2026-10-13T12:00:00Z");
function sale(
  id: string,
  daysAgo = 1,
  person: string | null = "PRIVATE_ACCOUNT",
  extra = {},
) {
  return {
    transaction_info: {
      transaction_id: id,
      transaction_event_code: "T0000",
      transaction_status: "S",
      transaction_initiation_date: new Date(
        +at - daysAgo * 86400000,
      ).toISOString(),
      transaction_amount: { value: "5.50", currency_code: "USD" },
      ...extra,
    },
    payer_info: {
      account_id: person ?? undefined,
      email_address: "never-store@example.com",
      payer_name: { given_name: "PRIVATE_NAME" },
    },
  };
}
async function historyFixture() {
  const merchant = await fixture();
  await getDb()
    .update(connections)
    .set({ scopes: ["https://uri.paypal.com/services/reporting/search/read"] })
    .where(eq(connections.merchantId, merchant.id));
  await getDb()
    .update(programs)
    .set({ effectiveFrom: at })
    .where(eq(programs.id, merchant.program.id));
  return merchant;
}
function client(rows: SearchRow[]) {
  return {
    request: async <T>() =>
      ({ transaction_details: rows, total_pages: 1 }) as T,
  };
}
beforeAll(setupDb);
beforeEach(resetDb);
afterAll(teardownDb);
describe("history importer", () => {
  it("counts a transaction once across event codes and an existing guest capture", async () => {
    const merchant = await historyFixture(),
      guest = await purchase(merchant, { account: null }),
      run = await startBackfill(merchant.id, undefined, "BACKFILL", false, at);
    await runBackfill(
      run.id,
      Date.now() + 45000,
      client([
        sale(guest.result.captureId, 1, null),
        sale(guest.result.captureId, 1, null, {
          transaction_event_code: "T0003",
        }),
        sale("RECOGNIZED", 2),
        sale("RECOGNIZED", 2, "PRIVATE_ACCOUNT", {
          transaction_event_code: "T0003",
        }),
      ]),
    );
    const { merchants } = await import("@/db/schema"),
      [business] = await getDb()
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchant.id));
    expect(business.stats).toMatchObject({
      payments: 2,
      recognizedPayments: 1,
      unrecognizedPayments: 1,
      customers: 1,
    });
    expect(await getDb().select().from(captures)).toHaveLength(2);
  });
  it("refuses a report identifying a different merchant account", async () => {
    const merchant = await historyFixture(),
      run = await startBackfill(merchant.id, undefined, "BACKFILL", false, at);
    const result = await runBackfill(run.id, Date.now() + 45000, {
      request: async <T>() =>
        ({
          account_number: "WRONG12345678",
          transaction_details: [sale("WRONGSALE")],
          total_pages: 1,
        }) as T,
    });
    expect(result.error).toBe("REPORT_ACCOUNT_MISMATCH");
    expect(await getDb().select().from(captures)).toHaveLength(0);
  });
  it("defers evaluation during import and then counts a fresh payment with four historical visits", async () => {
    const merchant = await historyFixture(),
      run = await startBackfill(merchant.id, undefined, "BACKFILL", false, at),
      fresh = await purchase(merchant, { account: "PRIVATE_ACCOUNT" });
    expect(fresh.result.recognized && fresh.result.progress?.type).toBe(
      "VISIT_MILESTONE",
    );
    expect(await getDb().select().from(rewards)).toHaveLength(0);
    await runBackfill(
      run.id,
      Date.now() + 45000,
      client(Array.from({ length: 4 }, (_, n) => sale(`HISTORIC${n}`, 4 - n))),
    );
    expect(await getDb().select().from(rewards)).toMatchObject([
      { state: "SCHEDULED", captureId: fresh.result.captureId },
    ]);
  });
  it("uses overlapping windows no longer than 31 days", () => {
    const windows = historyWindows(new Date(+at - 90 * 86400000), at);
    expect(windows).toHaveLength(3);
    expect(+windows[1].from).toBe(+windows[0].to - 86400000);
    expect(windows.every((w) => +w.to - +w.from <= 31 * 86400000)).toBe(true);
  });
  it("classifies only successful supported USD events and hashes identities immediately", () => {
    expect(classify("merchant", sale("SALE1"))?.kind).toBe("SALE");
    expect(classify("merchant", sale("GUEST", 1, null))?.kind).toBe(
      "UNRECOGNIZED",
    );
    for (const code of ["T0100", "T0013", "T0300"])
      expect(
        classify(
          "merchant",
          sale("IGNORE", 1, "PRIVATE_ACCOUNT", {
            transaction_event_code: code,
          }),
        ),
      ).toBeUndefined();
    expect(JSON.stringify(classify("merchant", sale("SALE1")))).not.toMatch(
      /PRIVATE_ACCOUNT|PRIVATE_NAME|never-store/,
    );
  });
  it("deduplicates overlap, carries history, and stores no raw rows or payer contacts", async () => {
    const merchant = await historyFixture(),
      rows = Array.from({ length: 7 }, (_, n) => sale(`SALE${n}`, 8 - n));
    rows.push(sale("GUEST", 1, null));
    const run = await startBackfill(
      merchant.id,
      undefined,
      "BACKFILL",
      false,
      at,
    );
    expect(
      (await runBackfill(run.id, Date.now() + 45000, client(rows))).done,
    ).toBe(true);
    expect(await getDb().select().from(captures)).toHaveLength(7);
    expect(await getDb().select().from(orders)).toHaveLength(7);
    expect(await getDb().select().from(historyEvents)).toHaveLength(8);
    expect(await getDb().select().from(rawEvents)).toHaveLength(0);
    const [person] = await getDb().select().from(customers);
    expect(person.key).toBe(customerKey(merchant.id, "PRIVATE_ACCOUNT"));
    expect(person.progress).toMatchObject({ current: 2, target: 5 });
    expect(
      (await getDb().select().from(rewards)).map((r) => [r.state, r.reason]),
    ).toEqual([["CANCELLED", "BEFORE_PROGRAM_START"]]);
    const persisted = JSON.stringify({
      customers: await getDb().select().from(customers),
      captures: await getDb().select().from(captures),
      history: await getDb().select().from(historyEvents),
      runs: await getDb().select().from(backfillRuns),
    });
    expect(persisted).not.toMatch(
      /PRIVATE_ACCOUNT|PRIVATE_NAME|never-store|payer_info|transaction_info/,
    );
    const again = await startBackfill(
      merchant.id,
      undefined,
      "BACKFILL",
      true,
      at,
    );
    await runBackfill(again.id, Date.now() + 45000, client(rows));
    expect(await getDb().select().from(visits)).toHaveLength(7);
    expect(await getDb().select().from(rewards)).toHaveLength(1);
  });
  it("applies a refund received before its sale and keeps the refunded visit out of progress", async () => {
    const merchant = await historyFixture(),
      refund = sale("REFUND1", 1, "PRIVATE_ACCOUNT", {
        transaction_event_code: "T1107",
        transaction_amount: { value: "-5.50", currency_code: "USD" },
        paypal_reference_id: "LATER",
        paypal_reference_id_type: "TXN",
      });
    const run = await startBackfill(
      merchant.id,
      undefined,
      "BACKFILL",
      false,
      at,
    );
    await runBackfill(
      run.id,
      Date.now() + 45000,
      client([refund, sale("LATER", 2)]),
    );
    const [capture] = await getDb().select().from(captures),
      [receipt] = await getDb().select().from(refundReceipts),
      [visit] = await getDb().select().from(visits);
    expect(capture.refundableCents).toBe(0);
    expect(receipt.appliedAt).not.toBeNull();
    expect(visit.status).toBe("VOID");
  });
  it("merges an unordered bridge without counting extra visits", async () => {
    const merchant = await historyFixture(),
      start = +at - 86400000;
    const rows = [0, 200, 100].map((minutes, n) =>
      sale(`BRIDGE${n}`, 1, "PRIVATE_ACCOUNT", {
        transaction_initiation_date: new Date(
          start + minutes * 60000,
        ).toISOString(),
      }),
    );
    const run = await startBackfill(
      merchant.id,
      undefined,
      "BACKFILL",
      false,
      at,
    );
    await runBackfill(run.id, Date.now() + 45000, client(rows));
    const result = await getDb().select().from(visits);
    expect(result).toHaveLength(1);
    expect(result[0].amountCents).toBe(1650);
  });
  it("returns work to the queue when its time budget expires and resumes", async () => {
    const merchant = await historyFixture(),
      run = await startBackfill(merchant.id, undefined, "BACKFILL", false, at);
    expect(
      (await runBackfill(run.id, Date.now() + 100, client([sale("RESUME")])))
        .done,
    ).toBe(false);
    expect((await getDb().select().from(backfillRuns))[0].status).toBe(
      "QUEUED",
    );
    expect(
      (await runBackfill(run.id, Date.now() + 45000, client([sale("RESUME")])))
        .done,
    ).toBe(true);
  });
  it("rejects a connection without Search permission and bounds high-volume windows", async () => {
    const merchant = await fixture();
    await expect(startBackfill(merchant.id)).rejects.toThrow(
      /Transaction Search/,
    );
    await getDb()
      .update(connections)
      .set({
        scopes: ["https://uri.paypal.com/services/reporting/search/read"],
      })
      .where(eq(connections.merchantId, merchant.id));
    const run = await startBackfill(merchant.id);
    const result = await runBackfill(run.id, Date.now() + 45000, {
      request: async <T>() => ({ total_pages: 21 }) as T,
    });
    expect(result.error).toBe("HISTORY_VOLUME_LIMIT");
  });
});
