import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { merchantUsers, user } from "@/db/schema";
import { setupDb, resetDb, teardownDb, fixture } from "./helpers/db";
import { requireFormMerchant } from "@/lib/merchant-form";
const { context } = vi.hoisted(() => ({ context: { user: "", selected: "" } }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: context.user },
        session: { id: "test-session", createdAt: new Date() },
      }),
    },
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => ({ value: context.selected }),
    set: (_name: string, value: string) => {
      context.selected = value;
    },
  }),
}));
beforeAll(setupDb);
beforeEach(resetDb);
afterAll(teardownDb);
it("authorizes the rendered form's business independently of another tab's selected cookie", async () => {
  const first = await fixture(),
    second = await fixture(undefined, "second-cafe"),
    id = randomUUID();
  await getDb()
    .insert(user)
    .values({
      id,
      name: "Owner",
      email: `${id}@example.com`,
      updatedAt: new Date(),
    });
  await getDb()
    .insert(merchantUsers)
    .values([
      { userId: id, merchantId: first.id },
      { userId: id, merchantId: second.id },
    ]);
  context.user = id;
  context.selected = second.id;
  const form = new FormData();
  form.set("merchantId", first.id);
  expect((await requireFormMerchant(form)).merchant.id).toBe(first.id);
});
it("rejects a forged tenant ID and missing form context", async () => {
  const merchant = await fixture(),
    id = randomUUID();
  await getDb()
    .insert(user)
    .values({
      id,
      name: "Unrelated owner",
      email: `${id}@example.com`,
      updatedAt: new Date(),
    });
  context.user = id;
  context.selected = merchant.id;
  const form = new FormData();
  form.set("merchantId", merchant.id);
  await expect(requireFormMerchant(form)).rejects.toThrow(/access denied/);
  await expect(requireFormMerchant(new FormData())).rejects.toThrow(
    /access denied/,
  );
});
