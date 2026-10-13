import { randomUUID } from "node:crypto";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchantUsers, merchants, settings, user } from "@/db/schema";
import { setupDb, resetDb, teardownDb, fixture } from "./helpers/db";
import { inviteOwner, acceptOwnerInvite, removeOwner } from "@/lib/team";
import { deleteMerchantAccount } from "@/lib/account-deletion";
const { send } = vi.hoisted(() => ({
  send: vi.fn(async (to: string, subject: string, text: string) => {
    void to;
    void subject;
    void text;
    return true;
  }),
}));
vi.mock("@/lib/email", () => ({
  emailConfigured: () => true,
  sendMerchantEmail: send,
}));
async function owner(verified = true) {
  const id = randomUUID(),
    email = `${id}@example.com`;
  await getDb().insert(user).values({
    id,
    name: "Owner",
    email,
    emailVerified: verified,
    updatedAt: new Date(),
  });
  return { id, email };
}
beforeAll(setupDb);
beforeEach(async () => {
  await resetDb();
  send.mockClear();
});
afterAll(teardownDb);
describe("co-owner access and account deletion", () => {
  it("binds a single-use invitation to the verified recipient and stores only hashes", async () => {
    const merchant = await fixture(),
      first = await owner(),
      second = await owner(false),
      wrong = await owner();
    await getDb()
      .insert(merchantUsers)
      .values({ userId: first.id, merchantId: merchant.id });
    await inviteOwner(first.id, merchant.id, second.email);
    const text = send.mock.calls[0][2] as string,
      url = new URL(text.slice(text.indexOf("https://"))),
      token = url.searchParams.get("token")!;
    expect(JSON.stringify(await getDb().select().from(settings))).not.toContain(
      second.email,
    );
    expect(JSON.stringify(await getDb().select().from(settings))).not.toContain(
      token,
    );
    await expect(
      acceptOwnerInvite(wrong.id, merchant.id, token),
    ).rejects.toThrow();
    await expect(
      acceptOwnerInvite(second.id, merchant.id, token),
    ).rejects.toThrow(/Verify/);
    await getDb()
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, second.id));
    await acceptOwnerInvite(second.id, merchant.id, token);
    expect(
      await getDb()
        .select()
        .from(merchantUsers)
        .where(eq(merchantUsers.merchantId, merchant.id)),
    ).toHaveLength(2);
    await expect(
      acceptOwnerInvite(second.id, merchant.id, token),
    ).rejects.toThrow();
    await removeOwner(first.id, merchant.id, second.id);
    expect(
      await getDb()
        .select()
        .from(merchantUsers)
        .where(eq(merchantUsers.merchantId, merchant.id)),
    ).toHaveLength(1);
    await expect(removeOwner(first.id, merchant.id, first.id)).rejects.toThrow(
      /last owner/,
    );
  });
  it("does not permit an unverified owner to send an invitation", async () => {
    const merchant = await fixture(),
      first = await owner(false);
    await getDb()
      .insert(merchantUsers)
      .values({ userId: first.id, merchantId: merchant.id });
    await expect(
      inviteOwner(first.id, merchant.id, "recipient@example.com"),
    ).rejects.toThrow(/Verify your own email/);
    expect(send).not.toHaveBeenCalled();
  });
  it("requires a fresh session and disconnects only businesses losing their last owner", async () => {
    const merchant = await fixture(),
      first = await owner(),
      second = await owner();
    await getDb()
      .insert(merchantUsers)
      .values({ userId: first.id, merchantId: merchant.id });
    await expect(
      deleteMerchantAccount(first.id, "", new Date(Date.now() - 16 * 60000)),
    ).rejects.toThrow(/Sign in again/);
    await getDb()
      .insert(merchantUsers)
      .values({ userId: second.id, merchantId: merchant.id });
    await deleteMerchantAccount(first.id, "", new Date());
    expect((await getDb().select().from(merchants))[0].status).toBe("ACTIVE");
    expect(
      await getDb().select().from(user).where(eq(user.id, first.id)),
    ).toHaveLength(0);
    await deleteMerchantAccount(second.id, "", new Date());
    const [business] = await getDb().select().from(merchants);
    expect(business.status).toBe("PAUSED");
    expect(business.purgeAfter).not.toBeNull();
    expect(
      await getDb()
        .select()
        .from(merchantUsers)
        .where(and(eq(merchantUsers.merchantId, merchant.id))),
    ).toHaveLength(0);
  });
});
