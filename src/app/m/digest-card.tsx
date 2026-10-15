import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { digests, suggestions } from "@/db/schema";
import { digestText, type DigestBody } from "@/lib/digests";
export default async function DigestCard({
  merchantId,
}: {
  merchantId: string;
}) {
  const [row] = await getDb()
    .select()
    .from(digests)
    .where(eq(digests.merchantId, merchantId))
    .orderBy(desc(digests.createdAt))
    .limit(1);
  if (!row) return null;
  const body = row.body as DigestBody;
  const [idea] = body.suggestionId
    ? await getDb()
        .select()
        .from(suggestions)
        .where(
          and(
            eq(suggestions.id, body.suggestionId),
            eq(suggestions.merchantId, merchantId),
            eq(suggestions.status, "PENDING"),
          ),
        )
    : [];
  return (
    <section className="merchant-card">
      <h2>This week</h2>
      <p>Week of {row.weekStart}</p>
      <p>{digestText(body)}</p>
      {idea && (
        <Link href={`/m/onboarding/program?idea=${idea.id}`}>Review idea</Link>
      )}{" "}
      <Link href="/m/cockpit" prefetch={false}>
        Open cockpit
      </Link>
    </section>
  );
}
