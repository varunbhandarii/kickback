import { apiActor, apiFailure, ApiError } from "@/lib/studio/api-actor";
import { rewardsCsv } from "@/lib/rewards/csv";
export async function GET(req: Request) {
  try {
    const a = await apiActor(req, {
        allowViewer: true,
        perMinute: ["rewards-csv", 10],
      }),
      raw =
        new URL(req.url).searchParams.get("year") ??
        String(new Date().getUTCFullYear());
    if (
      !/^\d{4}$/.test(raw) ||
      +raw < 2020 ||
      +raw > new Date().getUTCFullYear()
    )
      throw new ApiError(400, "Choose a tax year from 2020 through this year");
    return new Response(rewardsCsv(a.merchant, +raw), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="kickback-rewards-${raw}.csv"`,
      },
    });
  } catch (e) {
    return apiFailure(e);
  }
}
