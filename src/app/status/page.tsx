export const metadata = { title: "Service status" };
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { getEnv } from "@/lib/env";
import { cachedStatus, type Health } from "@/lib/status";
import type { Tone } from "@/lib/copy";
export const dynamic = "force-dynamic";
const tone: Record<Health, Tone> = { ok: "success", warn: "warn", down: "danger", info: "neutral" };
const word: Record<Health, string> = { ok: "Normal", warn: "Check", down: "Down", info: "Info" };
const headline: Record<Health, string> = {
  ok: "All systems normal",
  warn: "Running, with something to check",
  down: "Kickback is having trouble",
  info: "Status",
};
export default async function StatusPage() {
  let status: Awaited<ReturnType<typeof cachedStatus>> | undefined;
  try {
    status = await cachedStatus();
  } catch {
    status = undefined;
  }
  const page = getEnv().STATUS_PAGE_URL;
  const overall: Health = status?.overall ?? "down";
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1" style={{ paddingBlock: "48px 72px" }}>
        <div className="site-section-inner flex flex-col gap-8" style={{ maxWidth: 760 }}>
          <div className="flex flex-col gap-3">
            <span className="eyebrow">Service status</span>
            <h1 className="page-title flex items-center gap-3">
              <span
                className="flex flex-none items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: overall === "ok" ? "var(--forest)" : overall === "down" ? "var(--danger)" : "var(--warn)",
                  color: overall === "ok" ? "var(--on-forest)" : "var(--surface)",
                }}
                aria-hidden="true"
              >
                <Icon name={overall === "ok" ? "check" : "alert"} size={18} strokeWidth={3} />
              </span>
              {headline[overall]}
            </h1>
            <p className="page-sub" style={{ fontSize: 15 }}>
              {status
                ? `Checked ${new Date(status.checkedAt).toUTCString().replace(" GMT", " UTC")}. Refreshes every 30 seconds.`
                : "The status check itself could not run."}
            </p>
          </div>
          {status && (
            <section className="card" aria-label="Components">
              <ul className="flex flex-col">
                {status.rows.map((r, i) => (
                  <li
                    key={r.key}
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5"
                    style={{ padding: "14px 18px", borderTop: i ? "1px solid var(--line)" : undefined }}
                  >
                    <span className="flex flex-col">
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{r.label}</span>
                      <span className="caption">{r.value}</span>
                    </span>
                    {r.health !== "info" && (
                      <Chip tone={tone[r.health]} size="sm" dot>
                        {word[r.health]}
                      </Chip>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <nav aria-label="More status" className="flex flex-wrap gap-x-8 gap-y-3" style={{ fontSize: 15 }}>
            {page && (
              <a href={page} className="flex items-center gap-1.5">
                Uptime history
                <Icon name="external" size={14} />
              </a>
            )}
            <a href="https://www.paypal-status.com/product/sandbox" className="flex items-center gap-1.5">
              PayPal sandbox status
              <Icon name="external" size={14} />
            </a>
            <a href="/api/status">Machine-readable status</a>
          </nav>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
