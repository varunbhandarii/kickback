import { ProgressBody } from "./progress-body";
import { headers } from "next/headers";
import { readProgress } from "@/lib/payments/progress";
import { getEnv } from "@/lib/env";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your card",
  robots: { index: false, follow: false },
};
export default async function ProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ slug }, { t }, h] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const data = await readProgress(
    slug,
    t ?? "",
    h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown",
  );
  return (
    <ProgressBody
      data={data}
      slug={slug}
      sandbox={getEnv().KICKBACK_ENV === "sandbox"}
    />
  );
}
