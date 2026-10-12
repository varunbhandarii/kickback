"use client";
import Script from "next/script";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantName } from "@/lib/paypal/merchants";
type Summary = { orderId?: string; captureId?: string; captureStatus?: string; accountId?: string; wallet?: string; amount?: { value: string } };
type Session = { start: (options: { presentationMode: "auto" | "redirect" }, order: Promise<{ orderId: string }>) => Promise<void> };
type RedirectSession = Session & { hasReturned: () => boolean; resume: () => Promise<void> };
type Callbacks = { onApprove: (data: { orderId: string }) => Promise<void>; onCancel: () => void; onError: (error: { message?: string }) => void };
type SDK = {
  findEligibleMethods: (options: { currencyCode: string; countryCode: string }) => Promise<{ isEligible: (method: string) => boolean }>;
  createPayPalOneTimePaymentSession: (options: Callbacks) => RedirectSession;
  createVenmoOneTimePaymentSession: (options: Callbacks) => Session;
};
declare global { interface Window { paypal: { createInstance: (options: { clientId: string; components: string[]; pageType: string; partnerAttributionId?: string }) => Promise<SDK> } } }

export default function PayTest({ merchant, clientId, bnCode }: { merchant: MerchantName; clientId: string; bnCode?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [amount, setAmount] = useState("10.00");
  const amountRef = useRef(amount);
  useEffect(() => { amountRef.current = amount; }, [amount]);
  const [status, setStatus] = useState("Loading payment methods…");
  const [summary, setSummary] = useState<Summary>();
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const busyRef = useRef(false);
  const buttons = useRef<HTMLDivElement>(null);
  const token = useRef<string | undefined>(undefined);
  const pendingOrder = useRef<string | undefined>(undefined);
  const capture = useCallback(async (orderId: string) => {
    const orderToken = sessionStorage.getItem(`kickback-order:${orderId}`);
    if (!orderToken) throw new Error("Order context is missing. Return to the original browser tab.");
    pendingOrder.current = orderId;
    setRetry(true);
    const response = await fetch("/api/pay/capture-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, orderToken }) });
    const result = await response.json();
    if (!response.ok) throw new Error(`${result.error}${result.debug_id ? ` (${result.debug_id})` : ""}`);
    setSummary(result);
    setStatus(`Capture ${result.captureStatus ?? result.orderStatus}`);
    if (result.captureStatus === "COMPLETED") {
      sessionStorage.removeItem(`kickback-order:${orderId}`);
      token.current = undefined;
      pendingOrder.current = undefined;
      setRetry(false);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const cleanup: (() => void)[] = [];
    const container = buttons.current;
    async function initialize() {
      const sdk = await window.paypal.createInstance({ clientId, components: ["paypal-payments", "venmo-payments"], pageType: "checkout", partnerAttributionId: bnCode });
      const methods = await sdk.findEligibleMethods({ currencyCode: "USD", countryCode: "US" });
      if (cancelled || !container) return;
      container.replaceChildren();
      const callbacks: Callbacks = {
        onApprove: async ({ orderId }) => {
          try { await capture(orderId); }
          catch (error) { setStatus(error instanceof Error ? error.message : "Capture failed"); throw error; }
          finally { busyRef.current = false; setBusy(false); }
        },
        onCancel: () => { setStatus("Payment cancelled"); busyRef.current = false; setBusy(false); },
        onError: (error) => { setStatus(error.message ?? "Payment failed"); busyRef.current = false; setBusy(false); },
      };
      let eligible = 0;
      for (const method of ["paypal", "venmo"] as const) {
        let session: Session;
        if (method === "paypal") {
          const paypalSession = sdk.createPayPalOneTimePaymentSession(callbacks);
          if (paypalSession.hasReturned()) await paypalSession.resume();
          session = paypalSession;
        } else {
          if (!methods.isEligible(method)) continue;
          session = sdk.createVenmoOneTimePaymentSession(callbacks);
        }
        if (!methods.isEligible(method)) continue;
        eligible++;
        const button = document.createElement(`${method}-button`);
        button.setAttribute("type", "pay");
        button.setAttribute("class", method === "paypal" ? "paypal-gold" : "venmo-blue");
        button.style.display = "block";
        button.style.width = "280px";
        const start = () => {
          if (busyRef.current) return;
          if (!/^\d{1,3}\.\d{2}$/.test(amountRef.current) || Number(amountRef.current) < 1 || Number(amountRef.current) > 500) { setStatus("Enter $1.00–$500.00 with two decimal places"); return; }
          busyRef.current = true;
          setBusy(true);
          setStatus("Opening checkout…");
          setSummary(undefined);
          const requestId = crypto.randomUUID();
          const orderPromise = fetch("/api/pay/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ merchant, amount: amountRef.current, requestId }) })
            .then(async (response) => {
              const order = await response.json();
              if (!response.ok) throw new Error(`${order.error}${order.debug_id ? ` (${order.debug_id})` : ""}`);
              token.current = order.orderToken;
              sessionStorage.setItem(`kickback-order:${order.orderId}`, order.orderToken);
              return { orderId: order.orderId };
            });
          // start is called synchronously within the click gesture.
          session.start({ presentationMode: "auto" }, orderPromise).catch((error) => {
            setStatus(error instanceof Error ? error.message : "Checkout failed"); busyRef.current = false; setBusy(false);
          });
        };
        button.addEventListener("click", start);
        cleanup.push(() => button.removeEventListener("click", start));
        container.appendChild(button);
      }
      setStatus(eligible ? "Ready — sandbox payments only" : "No eligible wallet. Use a US sandbox buyer.");
    }
    initialize().catch((error) => { if (!cancelled) setStatus(error instanceof Error ? error.message : "SDK initialization failed"); });
    return () => { cancelled = true; cleanup.forEach((fn) => fn()); container?.replaceChildren(); };
  }, [loaded, clientId, bnCode, merchant, capture]);

  return <main className="mx-auto max-w-2xl p-8">
    <Script src="https://www.sandbox.paypal.com/web-sdk/v6/core" strategy="afterInteractive" onReady={() => setLoaded(true)} onError={() => setStatus("Unable to load PayPal SDK")} />
    <Link href="/" className="text-blue-700">← Kickback</Link>
    <h1 className="mt-6 text-3xl font-semibold">Sandbox checkout</h1>
    <p className="my-4">Merchant: <strong>{merchant}</strong>. Sign in using a sandbox buyer account.</p>
    <nav className="mb-6 flex gap-4">{["platform", "rosas", "salon", "bakery"].map((name) => <a key={name} href={`?merchant=${name}`} className="underline">{name}</a>)}</nav>
    <label className="block">Amount in USD <input className="ml-4 rounded border p-2" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={busy} /></label>
    <div ref={buttons} className="my-6 grid gap-3" aria-busy={busy} style={{ pointerEvents: busy ? "none" : "auto", opacity: busy ? 0.5 : 1 }} />
    <p role="status">{status}</p>
    {retry && <button className="mt-4 rounded border p-3" disabled={busy} onClick={async () => { if (!pendingOrder.current) return; setBusy(true); try { await capture(pendingOrder.current); } catch (e) { setStatus(e instanceof Error ? e.message : "Capture failed"); } finally { setBusy(false); } }}>Retry capture</button>}
    {summary && <div className="mt-6 rounded bg-slate-100 p-4"><h2 className="font-semibold">Capture result</h2><pre className="mt-3 overflow-auto text-sm">{JSON.stringify(summary, null, 2)}</pre><p className="mt-4 text-sm">Record these values in your local verification log. Check the merchant balance and buyer activity in sandbox.paypal.com.</p></div>}
  </main>;
}
