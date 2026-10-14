import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { loadMerchant } from "@/lib/merchants";
import { getEnv } from "@/lib/env";
import PrintButton from "./print-button";
export const dynamic = "force-dynamic";
export default async function Sign({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    merchant = await loadMerchant(slug);
  if (!merchant) notFound();
  const url = new URL(`/pay/${slug}`, getEnv().APP_URL).href,
    spec = merchant.spec;
  const qr = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 2,
  });
  return (
    <main className="print-sign">
      <PrintButton />
      <p className="pay-brand">
        KICKBACK {getEnv().KICKBACK_ENV === "sandbox" && "· SANDBOX DEMO"}
      </p>
      <h1>{merchant.displayName}</h1>
      <h2>
        {spec.type === "VISIT_MILESTONE"
          ? `${spec.n} visits`
          : `$${(spec.spendCents / 100).toFixed(2)} spent`}
        . ${(spec.rewardCents / 100).toFixed(2)} back.
      </h2>
      {spec.signPitch && <p>{spec.signPitch}</p>}
      <p>Scan to pay with PayPal or Venmo.</p>
      <div className="sign-qr" dangerouslySetInnerHTML={{ __html: qr }} />
      <p>{url}</p>
      <p className="sign-fine">
        Qualifying purchases from ${(spec.minTicketCents / 100).toFixed(2)}{" "}
        within {spec.windowDays} days. Purchases within {spec.mergeWindowMin}{" "}
        minutes count as one visit. Reward limits apply. Terms: {url}/terms
      </p>
    </main>
  );
}
