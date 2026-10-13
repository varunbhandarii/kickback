import QRCode from "qrcode";
import { loadMerchant } from "@/lib/merchants";
import { getEnv } from "@/lib/env";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!(await loadMerchant(slug)))
    return new Response("Not found", { status: 404 });
  const png = await QRCode.toBuffer(
    new URL(`/pay/${slug}`, getEnv().APP_URL).href,
    { type: "png", errorCorrectionLevel: "Q", margin: 2, width: 512 },
  );
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      ...(new URL(_request.url).searchParams.get("download") === "1"
        ? { "Content-Disposition": `attachment; filename="${slug}-qr.png"` }
        : {}),
    },
  });
}
