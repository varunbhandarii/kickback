import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  user,
  merchantUsers,
  merchants,
  connections,
  programs,
} from "@/db/schema";
import {
  saveBusiness,
  saveMenu,
  activateProgram,
  lockSlug,
} from "@/lib/onboarding";
import { slugFromName, slugSchema } from "@/lib/merchant-inputs";
import { defaultProgram } from "@/lib/engine/program";
import { resetDb, setupDb, teardownDb } from "./helpers/db";
async function owner() {
  const id = randomUUID();
  await getDb()
    .insert(user)
    .values({
      id,
      name: "Test owner",
      email: `${id}@example.com`,
      updatedAt: new Date(),
    });
  return id;
}
const fields = {
  displayName: "Rosa's Cafe",
  slug: "rosas-cafe",
  tz: "America/New_York",
  category: "cafe",
};
describe("business onboarding", () => {
  beforeAll(setupDb);
  beforeEach(resetDb);
  afterAll(teardownDb);
  it("creates one owned business with a draft and a resumable next step", async () => {
    const id = await owner(),
      merchant = await saveBusiness(id, fields);
    expect(merchant.status).toBe("ONBOARDING");
    expect(merchant.onboardingStep).toBe("connect");
    expect((await getDb().select().from(merchantUsers))[0].userId).toBe(id);
    expect((await getDb().select().from(programs))[0].status).toBe("DRAFT");
    await expect(
      saveBusiness(id, { ...fields, slug: "another-cafe" }),
    ).rejects.toThrow("already has a business");
  });
  it("checks ownership in mutations and refuses changing a printed slug", async () => {
    const first = await owner(),
      second = await owner(),
      merchant = await saveBusiness(first, fields);
    await expect(
      saveMenu(second, merchant.id, [
        { id: "coffee", name: "Coffee", priceCents: 400 },
      ]),
    ).rejects.toThrow("access denied");
    await lockSlug(first, merchant.id);
    await expect(
      saveBusiness(first, { ...fields, slug: "different-cafe" }, merchant.id),
    ).rejects.toThrow("locked");
  });
  it("requires a connected account before activation and saves the menu", async () => {
    const id = await owner(),
      merchant = await saveBusiness(id, fields);
    await expect(
      activateProgram(id, merchant.id, defaultProgram),
    ).rejects.toThrow("Connect");
    await getDb().insert(connections).values({
      merchantId: merchant.id,
      mode: "PARTNER",
      merchantIdInPayPal: "MERCHANT12345A",
      status: "CONNECTED",
    });
    await activateProgram(id, merchant.id, defaultProgram);
    await saveMenu(
      id,
      merchant.id,
      [{ id: "coffee", name: "Coffee", priceCents: 400 }],
      true,
    );
    const [updated] = await getDb()
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchant.id));
    expect(updated.status).toBe("ACTIVE");
    expect(updated.onboardingStep).toBe("done");
    expect(updated.menu[0].priceCents).toBe(400);
    const [program] = await getDb().select().from(programs);
    expect(program.status).toBe("ACTIVE");
    expect(program.effectiveFrom.getTime()).toBeGreaterThan(Date.now() - 10000);
  });
  it("validates reserved slugs and converts the business name predictably", () => {
    expect(slugFromName("Rosa's Café")).toBe("rosas-cafe");
    expect(slugSchema.safeParse("api").success).toBe(false);
    expect(slugSchema.safeParse("---").success).toBe(false);
  });
});
