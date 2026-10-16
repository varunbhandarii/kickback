export const metadata = { title: "Settings" };
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, merchantUsers, user as users } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import MenuForm from "../onboarding/menu/menu-form";
import { BusinessSettings, DisconnectForm } from "./settings-forms";
import { emailConfigured } from "@/lib/email";
import AccountSecurity from "./account-security";
import DeleteAccountForm from "./delete-account-form";
import { saveVoice } from "../onboarding/program/ai-actions";
export default async function SettingsPage() {
  const { user, merchant } = await requireMerchant(),
    [connection] = await getDb()
      .select()
      .from(connections)
      .where(eq(connections.merchantId, merchant.id)),
    owners = await getDb()
      .select({ id: users.id, email: users.email })
      .from(merchantUsers)
      .innerJoin(users, eq(users.id, merchantUsers.userId))
      .where(
        and(
          eq(merchantUsers.merchantId, merchant.id),
          eq(merchantUsers.role, "OWNER"),
        ),
      );
  return (
    <>
      <h1>Settings</h1>
      <form action={saveVoice} className="merchant-card">
        <input type="hidden" name="merchantId" value={merchant.id} />
        <h2>Your voice</h2>
        <label>
          Voice hints
          <textarea
            name="voiceHints"
            maxLength={200}
            defaultValue={merchant.voiceHints}
            placeholder="Friendly and short; we say see you tomorrow."
          />
        </label>
        <button>Save voice</button>
        <p>
          Hints guide proposed copy. Every note still passes the same
          validators.
        </p>
      </form>
      <BusinessSettings
        initial={{
          id: merchant.id,
          displayName: merchant.displayName,
          slug: merchant.slug,
          tz: merchant.tz,
          category: merchant.category,
          slugLocked: merchant.slugLocked,
        }}
      />
      <MenuForm
        merchantId={merchant.id}
        initial={merchant.menu}
        slug={merchant.slug}
      />
      <section className="merchant-card">
        <h2>PayPal connection</h2>
        <p>
          {connection?.mode ?? "No connection"} ·{" "}
          {connection?.status ?? "Not connected"}
        </p>
        {merchant.purgeAfter && (
          <p>
            Data deletion is scheduled for{" "}
            {merchant.purgeAfter.toLocaleString("en-US", {
              timeZone: merchant.tz,
            })}
            . Reconnecting before then cancels deletion.
          </p>
        )}
        <Link href="/m/onboarding/connect">
          {connection?.mode === "BYO" && connection.status === "CONNECTED"
            ? "Replace API credentials"
            : "Connect or reconnect PayPal"}
        </Link>
      </section>
      <AccountSecurity
        merchantId={merchant.id}
        email={user.email}
        verified={user.emailVerified}
        emailEnabled={emailConfigured()}
        currentId={user.id}
        owners={owners}
      />
      <DisconnectForm merchantId={merchant.id} />
      <DeleteAccountForm />
    </>
  );
}
