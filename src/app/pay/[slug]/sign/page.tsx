export const metadata = { title: "Counter sign" };
import { notFound } from "next/navigation";
import { loadMerchant } from "@/lib/merchants";
import { getEnv } from "@/lib/env";
import { Icon } from "@/components/icons";
import PrintButton from "./print-button";
import { SignSheet } from "./sign-sheet";
export const dynamic = "force-dynamic";
export default async function Sign({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    merchant = await loadMerchant(slug);
  if (!merchant) notFound();
  const url = new URL(`/pay/${slug}`, getEnv().APP_URL).href;
  return (
    <main className="sign-screen">
      <div className="sign-toolbar no-print">
        <div className="flex flex-col gap-0.5">
          <p style={{ fontWeight: 600 }}>Counter sign for {merchant.displayName}</p>
          <p className="caption">Prints on US Letter. In the print dialog, turn off headers and footers.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-secondary" href={`/api/pay/${slug}/qr.png?download=1`} download>
            <Icon name="download" size={18} />
            Download QR (PNG)
          </a>
          <PrintButton />
        </div>
      </div>
      <SignSheet
        name={merchant.displayName}
        spec={merchant.spec}
        url={url}
        sandbox={getEnv().KICKBACK_ENV === "sandbox"}
      />
    </main>
  );
}
