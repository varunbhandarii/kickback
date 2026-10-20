import type { CSSProperties } from "react";
import QRCode from "qrcode";
import type { ProgramSpec } from "@/lib/engine/program";
import { Wordmark } from "@/components/brand";
import { minutesInWords, money, moneyShort, ordinal, signHeadline } from "@/lib/format";

/** The printable US Letter sign. Sizes are in container units, so it also renders as a thumbnail. */
export async function SignSheet({
  name,
  spec,
  url,
  sandbox,
  thumbnail = false,
}: {
  name: string;
  spec: ProgramSpec;
  url: string;
  sandbox: boolean;
  thumbnail?: boolean;
}) {
  const qr = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 2,
  });
  const shortUrl = url.replace(/^https?:\/\//, "");
  const [line1, line2] = signHeadline(spec);
  const reward = moneyShort(spec.rewardCents);
  const visit = spec.type === "VISIT_MILESTONE";
  // Punches shrink so long cards still fit the sheet width.
  const punches = visit && spec.n <= 24 ? spec.n : 0;
  const punchSize = punches > 7 ? (86 - 2.2 * (punches - 1)) / punches : 9.3;
  const steps = visit
    ? ["Pay with PayPal or Venmo", "Every visit punches your card", `Your ${ordinal(spec.n)} visit sends ${reward} back to your wallet`]
    : ["Pay with PayPal or Venmo", "Every purchase adds to your card", `Spend ${moneyShort(spec.spendCents)} and ${reward} comes back to your wallet`];
  const Name = thumbnail ? "p" : "h1";
  const Headline = thumbnail ? "p" : "h2";
  return (
      <article className="sign-sheet" {...(thumbnail ? { "aria-hidden": true } : { "aria-labelledby": "sign-name" })}>
        <header className="sign-band">
          <span className="sign-eyebrow">Thank-you rewards</span>
          <Name id={thumbnail ? undefined : "sign-name"} className="sign-name">
            {name}
          </Name>
          {spec.signPitch && <p className="sign-pitch">{spec.signPitch}</p>}
        </header>
        <div className="sign-body">
          <Headline className="sign-headline num">
            {line1}
            <br />
            {line2}
          </Headline>

          {punches ? (
            <div
              className="sign-punches"
              role="img"
              aria-label={`Punch card with ${punches} punches; the ${ordinal(punches)} is the ${reward} reward`}
            >
              {Array.from({ length: punches - 1 }, (_, i) => (
                <span key={i} className="sign-punch" style={{ width: `${punchSize}cqw`, height: `${punchSize}cqw` }} />
              ))}
              <span
                className="sign-punch sign-punch-reward"
                style={{ width: `${punchSize}cqw`, height: `${punchSize}cqw`, fontSize: `${(punchSize * 3.2) / 9.3}cqw` } as CSSProperties}
              >
                {reward}
              </span>
            </div>
          ) : (
            <div
              className="sign-punches"
              role="img"
              aria-label={visit ? `${spec.n} visits earn ${reward} back` : `${moneyShort(spec.spendCents)} in purchases earns ${reward} back`}
            >
              <span className="sign-track" />
              <span className="sign-punch sign-punch-reward">{reward}</span>
            </div>
          )}

          <div className="sign-grid">
            <div className="flex flex-col items-center">
              <div className="sign-qr" role="img" aria-label="QR code to the pay page" dangerouslySetInnerHTML={{ __html: qr }} />
              <span className="sign-scan">Scan to pay</span>
            </div>
            <ol className="sign-steps">
              {steps.map((step, i) => (
                <li key={step}>
                  <span className="sign-step-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
              <li style={{ fontWeight: 500, color: "#3f4f47", paddingLeft: "6.9cqw" }}>No app. No sign-up.</li>
            </ol>
          </div>

          <footer className="sign-foot">
            <span className="sign-url">{shortUrl}</span>
            <p className="sign-fine num">
              {visit
                ? `Visits from ${money(spec.minTicketCents)} within ${spec.windowDays} days count.`
                : `Purchases from ${money(spec.minTicketCents)} within ${spec.windowDays} days count.`}{" "}
              Purchases within {minutesInWords(spec.mergeWindowMin)} count as one visit. Up to{" "}
              {moneyShort(spec.perCustomerMonthlyCapCents)} per customer each month while the shop’s reward budget
              lasts. Full terms: {shortUrl}/terms
            </p>
            <div className="sign-endorse">
              <span className="inline-flex items-center gap-1.5">
                Rewards by <Wordmark size={16} />
              </span>
              {sandbox && <span>Sandbox demo: test payments only</span>}
            </div>
          </footer>
        </div>
      </article>
  );
}
