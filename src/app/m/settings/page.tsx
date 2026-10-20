export const metadata = { title: "Settings" };
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, merchantUsers, user as users } from "@/db/schema";
import { requireMerchant } from "@/lib/dal";
import { BusinessSettings, DisconnectForm } from "./settings-forms";
import { emailConfigured } from "@/lib/email";
import AccountSecurity from "./account-security";
import DeleteAccountForm from "./delete-account-form";
import { saveVoice } from "../onboarding/program/ai-actions";
import ConnectionStatus from "../onboarding/connect/connection-status";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/form-controls";
import { ThemeSwitch } from "@/components/shell/theme-switch";
import { connectionMode } from "@/lib/copy";
import { when } from "@/lib/format";
const sections = [
  ["business", "Business"],
  ["voice", "Thank-you voice"],
  ["paypal", "PayPal connection"],
  ["team", "Team"],
  ["appearance", "Appearance"],
  ["danger", "Danger zone"],
] as const;
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ disconnected?: string }>;
}) {
  const { user, merchant } = await requireMerchant(),
    query = await searchParams,
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
      <PageHeader title="Settings" sub={merchant.displayName} />
      {query.disconnected === "1" && (
        <p className="banner banner-danger" role="status">
          PayPal is disconnected. Checkout and rewards are stopped.
        </p>
      )}
      <div className="settings-grid">
        <nav aria-label="Settings sections" className="settings-nav">
          {sections.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="nav-item">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-6">
          <section id="business" className="card card-pad settings-section" aria-labelledby="business-title">
            <h2 id="business-title" className="section-title">
              Business
            </h2>
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
          </section>

          <section id="voice" className="card card-pad settings-section" aria-labelledby="voice-title">
            <div>
              <h2 id="voice-title" className="section-title">
                Thank-you voice
              </h2>
              <p className="text-2" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 4 }}>
                Hints guide proposed copy. Every note still passes the same validators.
              </p>
            </div>
            <form action={saveVoice} className="form-stack">
              <input type="hidden" name="merchantId" value={merchant.id} />
              <label className="field">
                <span className="field-label">Voice hints</span>
                <textarea
                  className="textarea"
                  name="voiceHints"
                  maxLength={200}
                  rows={3}
                  defaultValue={merchant.voiceHints}
                  placeholder="Friendly and short; we say see you tomorrow."
                  aria-describedby="voice-help"
                />
                <span id="voice-help" className="field-help">
                  One line, up to 200 characters.
                </span>
              </label>
              <SubmitButton className="btn btn-secondary self-start">Save voice</SubmitButton>
            </form>
          </section>

          <section id="paypal" className="card card-pad settings-section" aria-labelledby="paypal-title">
            <h2 id="paypal-title" className="section-title">
              PayPal connection
            </h2>
            <ConnectionStatus
              merchantId={merchant.id}
              name={merchant.displayName}
              status={connection?.status ?? "NOT_CONNECTED"}
              mode={connection?.mode ?? "PARTNER"}
            />
            <dl className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <div>
                <dt className="caption">How you connected</dt>
                <dd style={{ fontWeight: 600 }}>{connectionMode(connection?.mode)}</dd>
              </div>
              <div>
                <dt className="caption">Last checked</dt>
                <dd className="num" style={{ fontWeight: 600 }}>
                  {connection?.lastStatusCheckAt ? when(connection.lastStatusCheckAt, merchant.tz) : "Not yet"}
                </dd>
              </div>
            </dl>
            {merchant.purgeAfter && (
              <p className="banner banner-warn">
                Data deletion is scheduled for {when(merchant.purgeAfter, merchant.tz)}. Reconnecting before then
                cancels deletion.
              </p>
            )}
            <Link href="/m/onboarding/connect" className="btn btn-secondary self-start">
              {connection?.mode === "BYO" && connection.status === "CONNECTED"
                ? "Replace API credentials"
                : "Connect or reconnect PayPal"}
            </Link>
          </section>

          <section id="team" className="card card-pad settings-section" aria-labelledby="team-title">
            <h2 id="team-title" className="section-title">
              Team
            </h2>
            <AccountSecurity
              merchantId={merchant.id}
              email={user.email}
              verified={user.emailVerified}
              emailEnabled={emailConfigured()}
              currentId={user.id}
              owners={owners}
            />
          </section>

          <section id="appearance" className="card card-pad settings-section" aria-labelledby="appearance-title">
            <div>
              <h2 id="appearance-title" className="section-title">
                Appearance
              </h2>
              <p className="text-2" style={{ fontSize: 14, marginTop: 4 }}>
                Theme for the merchant app on this device. System follows your device setting.
              </p>
            </div>
            <div style={{ maxWidth: 360 }}>
              <ThemeSwitch />
            </div>
          </section>

          <section id="danger" className="card card-pad settings-section" aria-labelledby="danger-title" style={{ borderColor: "var(--danger-line)" }}>
            <h2 id="danger-title" className="section-title" style={{ color: "var(--danger)" }}>
              Danger zone
            </h2>
            <DisconnectForm merchantId={merchant.id} />
            <hr className="divider" />
            <DeleteAccountForm />
          </section>
        </div>
      </div>
    </>
  );
}
