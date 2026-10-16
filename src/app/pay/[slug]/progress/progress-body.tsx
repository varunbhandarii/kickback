import Link from "next/link";
import type { readProgress } from "@/lib/payments/progress";
export function ProgressBody({
  data,
  slug,
}: {
  data: Awaited<ReturnType<typeof readProgress>>;
  slug: string;
}) {
  if ("error" in data)
    return (
      <main className="pay-shell">
        <h1>Your visits</h1>
        <p>{data.error}</p>
      </main>
    );
  const p = data.progress,
    money = (n: number) => `$${(n / 100).toFixed(2)}`;
  return (
    <main className="pay-shell">
      <h1>{data.name}</h1>
      <h2>Your visits</h2>
      <p>{data.rule}</p>
      {p && (
        <>
          <p>
            {p.type === "VISIT_MILESTONE"
              ? `Visit ${p.current} of ${p.target} — ${Math.max(0, p.target - p.current)} more for ${money(p.rewardCents)} back`
              : `${money(p.current)} of ${money(p.target)} — ${money(Math.max(0, p.target - p.current))} more for ${money(p.rewardCents)} back`}
          </p>
          <progress
            aria-label="Reward progress"
            value={p.current}
            max={p.target}
          />
        </>
      )}
      <p>
        Last visit:{" "}
        {new Intl.DateTimeFormat("en-US", {
          timeZone: data.tz,
          dateStyle: "medium",
        }).format(data.lastSeen)}
      </p>
      <p>
        Last 90 days: {data.paid.count} rewards, {money(data.paid.cents)}{" "}
        returned.
      </p>
      <p>Keep this link private: anyone with it can see this summary.</p>
      <Link href={`/pay/${slug}/terms#why-refund`}>
        Why did I get a refund?
      </Link>
      <p>
        <Link href={`/pay/${slug}/terms`}>Program terms</Link>
      </p>
    </main>
  );
}
