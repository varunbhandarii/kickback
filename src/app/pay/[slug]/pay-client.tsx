"use client";
import Script from "next/script";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ProgramSpec } from "@/lib/engine/program";
import type { Progress } from "@/lib/engine/evaluate";
import type { MenuItem } from "@/db/schema";
import type {} from "@/app/dev/pay-test/pay-test";
import { Icon } from "@/components/icons";
import {
  MenuPicker,
  PayFooter,
  ProgramTicket,
  Receipt,
  RewardTicket,
  SaveCard,
  ShopBand,
  VisitTicket,
} from "./pay-views";
type Reward = {
  id: string;
  token: string;
  state: string;
  amountCents: number;
  kind?: string;
};
type Result = {
  captureStatus: string;
  recognized: boolean;
  progress?: Progress;
  reward?: Reward;
  progressUrl?: string;
  amountCents?: number;
  wallet?: string;
};
const walletName = (w?: string) =>
  w?.toUpperCase() === "VENMO" ? "Venmo" : w ? "PayPal" : undefined;
function prefersDark() {
  const set = document.documentElement.dataset.theme;
  if (set === "dark") return true;
  if (set === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const shareSubscribe = () => () => {},
  shareSnapshot = () => typeof navigator.share === "function",
  noShare = () => false;
export default function PayClient({
  slug,
  name,
  menu,
  spec,
  paused,
  clientId,
  bnCode,
  sandbox,
}: {
  slug: string;
  name: string;
  menu: MenuItem[];
  spec: ProgramSpec;
  paused: boolean;
  clientId: string;
  bnCode?: string;
  sandbox: boolean;
}) {
  const [ready, setReady] = useState(false),
    [item, setItem] = useState(menu[0]?.id ?? "other"),
    [amount, setAmount] = useState("5.50");
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(
      paused ? "Payments are paused" : "Loading payment methods…",
    ),
    [result, setResult] = useState<Result>();
  const [retry, setRetry] = useState<string>(),
    buttons = useRef<HTMLDivElement>(null),
    busyRef = useRef(false);
  const [linkStatus, setLinkStatus] = useState("");
  const [methods, setMethods] = useState<"loading" | number>("loading");
  const canShare = useSyncExternalStore(shareSubscribe, shareSnapshot, noShare);
  const selection = useRef({ item, amount });
  useEffect(() => {
    selection.current = { item, amount };
  }, [item, amount]);
  const capture = useCallback(async (orderId: string) => {
    const orderToken = sessionStorage.getItem(`kickback-order:${orderId}`);
    if (!orderToken)
      throw new Error("Return to the browser where you started this payment.");
    setRetry(orderId);
    const response = await fetch("/api/pay/capture-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, orderToken }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.retryable) setRetry(undefined);
      throw new Error(
        data.retryable
          ? "Your payment was not completed. Choose a wallet below to try again."
          : "We could not confirm the payment yet. Try checking again.",
      );
    }
    setResult(data);
    setStatus(
      data.captureStatus === "PENDING"
        ? "Your payment is pending. Rewards count after it completes."
        : "Thank you for your purchase!",
    );
    if (data.captureStatus !== "PENDING") {
      setRetry(undefined);
      sessionStorage.removeItem(`kickback-order:${orderId}`);
    }
  }, []);
  useEffect(() => {
    if (!ready || paused) return;
    let cancelled = false;
    const container = buttons.current,
      cleanup: (() => void)[] = [];
    async function init() {
      const sdk = await window.paypal.createInstance({
        clientId,
        components: ["paypal-payments", "venmo-payments"],
        pageType: "checkout",
        partnerAttributionId: bnCode,
      });
      const eligible = await sdk.findEligibleMethods({
        currencyCode: "USD",
        countryCode: "US",
      });
      if (cancelled || !container) return;
      const callbacks = {
        onApprove: async ({ orderId }: { orderId: string }) => {
          try {
            await capture(orderId);
          } catch (e) {
            setStatus(
              e instanceof Error ? e.message : "Payment could not be confirmed",
            );
          } finally {
            busyRef.current = false;
            setBusy(false);
          }
        },
        onCancel: () => {
          setStatus("Payment cancelled. You can try again.");
          busyRef.current = false;
          setBusy(false);
        },
        onError: () => {
          setStatus("Checkout could not open. Please try again.");
          busyRef.current = false;
          setBusy(false);
        },
      };
      let count = 0,
        resumed = false;
      for (const wallet of ["paypal", "venmo"] as const) {
        const paypalSession =
          wallet === "paypal"
            ? sdk.createPayPalOneTimePaymentSession(callbacks)
            : undefined;
        const session =
          paypalSession ?? sdk.createVenmoOneTimePaymentSession(callbacks);
        if (paypalSession?.hasReturned()) {
          resumed = true;
          await paypalSession.resume();
        }
        if (!eligible.isEligible(wallet)) continue;
        count++;
        const button = document.createElement(`${wallet}-button`);
        button.setAttribute("type", "pay");
        // Only PayPal's documented color options: white on dark surfaces.
        button.setAttribute(
          "class",
          wallet === "paypal"
            ? prefersDark()
              ? "paypal-white"
              : "paypal-gold"
            : "venmo-blue",
        );
        button.style.display = "block";
        button.style.width = "100%";
        const click = () => {
          if (busyRef.current) return;
          const selected = selection.current,
            cents = Math.round(Number(selected.amount) * 100);
          if (
            selected.item === "other" &&
            (!/^\d{1,3}(\.\d{1,2})?$/.test(selected.amount) ||
              cents < 100 ||
              cents > 50000)
          ) {
            setStatus("Enter an amount from $1 to $500.");
            return;
          }
          busyRef.current = true;
          setBusy(true);
          setResult(undefined);
          setRetry(undefined);
          setStatus("Opening checkout…");
          const order = fetch("/api/pay/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slug,
              wallet,
              requestId: crypto.randomUUID(),
              ...(selected.item === "other"
                ? { amountCents: cents }
                : { itemId: selected.item }),
            }),
          }).then(async (response) => {
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.error ?? "Unable to create payment");
            sessionStorage.setItem(
              `kickback-order:${data.orderId}`,
              data.orderToken,
            );
            return { orderId: data.orderId };
          });
          session
            .start(
              {
                presentationMode:
                  wallet === "paypal" &&
                  /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
                    ? "redirect"
                    : "auto",
              },
              order,
            )
            .catch(() => {
              setStatus("Checkout could not open. Please try again.");
              busyRef.current = false;
              setBusy(false);
            });
        };
        button.addEventListener("click", click);
        cleanup.push(() => button.removeEventListener("click", click));
        container.appendChild(button);
      }
      setMethods(count);
      if (!resumed)
        setStatus(
          count
            ? "Choose a wallet to pay"
            : "No eligible wallet. Try a supported PayPal browser or device.",
        );
    }
    init().catch(() => {
      if (!cancelled) {
        setMethods(0);
        setStatus("Unable to load payment methods. Please refresh.");
      }
    });
    return () => {
      cancelled = true;
      cleanup.forEach((fn) => fn());
      container?.replaceChildren();
    };
  }, [ready, paused, clientId, bnCode, slug, capture]);
  const rewardId = result?.reward?.id,
    rewardToken = result?.reward?.token;
  useEffect(() => {
    if (!rewardId || !rewardToken) return;
    const controller = new AbortController(),
      start = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - start >= 60000) {
        clearInterval(timer);
        return;
      }
      try {
        const response = await fetch(
          `/api/pay/reward/${rewardId}?t=${encodeURIComponent(rewardToken)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!response.ok) return;
        const next = await response.json();
        setResult((prev) =>
          prev?.reward?.id === rewardId
            ? { ...prev, reward: { ...prev.reward, ...next } }
            : prev,
        );
        if (
          [
            "SENT",
            "CONFIRMED",
            "FAILED",
            "CANCELLED",
            "OFFSET",
            "HELD",
            "DEFERRED",
          ].includes(next.state)
        )
          clearInterval(timer);
      } catch {
        /* The durable worker continues if this tab loses connectivity. */
      }
    }, 2000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [rewardId, rewardToken]);
  const progress = result?.progress,
    reward = result?.reward,
    paidWallet = walletName(result?.wallet);
  const selectedCents =
    item === "other"
      ? Math.round(Number(amount) * 100)
      : (menu.find((m) => m.id === item)?.priceCents ?? 0);
  const totalValid =
    item !== "other" ||
    (/^\d{1,3}(\.\d{1,2})?$/.test(amount) &&
      selectedCents >= 100 &&
      selectedCents <= 50000);
  const checkAgain = async () => {
    if (!retry) return;
    setBusy(true);
    try {
      await capture(retry);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Please try again");
    } finally {
      setBusy(false);
    }
  };
  const copyLink = async () => {
    if (!result?.progressUrl) return;
    try {
      await navigator.clipboard.writeText(result.progressUrl);
      setLinkStatus("Link copied");
    } catch {
      setLinkStatus("Open your card below and bookmark it.");
    }
  };
  const shareLink = () => {
    if (!result?.progressUrl) return;
    void navigator
      .share({ title: `Your visits at ${name}`, url: result.progressUrl })
      .catch(() => {});
  };
  const startOver = () => {
    setResult(undefined);
    setLinkStatus("");
    setStatus(methods === 0 ? status : "Choose a wallet to pay");
  };
  const paidLine = !result
    ? ""
    : result.captureStatus === "PENDING"
      ? "Your payment is processing."
      : result.amountCents !== undefined
        ? `Paid ${money(result.amountCents)}${paidWallet ? ` with ${paidWallet}` : ""}. Thank you!`
        : "Payment received. Thank you!";
  const counted =
    result?.recognized && reward
      ? "Reward visit"
      : result?.recognized &&
          progress?.type === "VISIT_MILESTONE" &&
          (result.amountCents === undefined ||
            result.amountCents >= spec.minTicketCents)
        ? `Visit ${progress.current}`
        : undefined;
  return (
    <main className="customer">
      <Script
        src={`https://${sandbox ? "www.sandbox" : "www"}.paypal.com/web-sdk/v6/core`}
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => setStatus("Unable to load PayPal. Please refresh.")}
      />
      <ShopBand
        name={name}
        sandbox={sandbox}
        compact={Boolean(result)}
        sub={
          result ? (
            <p className="flex items-center gap-2.5" style={{ fontSize: 15 }}>
              <span
                className="flex flex-none items-center justify-center"
                style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--brand-mint)", color: "#10201a" }}
                aria-hidden="true"
              >
                <Icon name={result.captureStatus === "PENDING" ? "clock" : "check"} size={14} strokeWidth={3} />
              </span>
              <span className="num">{paidLine}</span>
            </p>
          ) : (
            <p className="band-sub" style={{ fontSize: 15 }}>
              {spec.signPitch || "Thanks for stopping by."}
            </p>
          )
        }
      />
      <div className="customer-col">
        {result && (
          <>
            {result.captureStatus === "PENDING" && (
              <div className="banner banner-info" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                <span>Your payment is processing. Visits count after it completes.</span>
                {retry && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={checkAgain}>
                    Check payment again
                  </button>
                )}
              </div>
            )}
            {!result.recognized ? (
              <section className="card card-pad flex flex-col gap-2" aria-labelledby="unlinked-title">
                <h2 id="unlinked-title" className="card-title">
                  This purchase didn&apos;t count as a visit
                </h2>
                <p className="text-2" style={{ fontSize: 15 }}>
                  We couldn&apos;t link this payment to a wallet. Paying with PayPal or Venmo on
                  this page next time will count.
                </p>
              </section>
            ) : reward ? (
              <RewardTicket reward={reward} spec={spec} name={name} wallet={paidWallet} />
            ) : progress ? (
              <VisitTicket progress={progress} spec={spec} paidCents={result.amountCents} />
            ) : null}
            {result.recognized && result.progressUrl && (
              <SaveCard
                url={result.progressUrl}
                canShare={canShare}
                name={name}
                onCopy={copyLink}
                onShare={shareLink}
                status={linkStatus}
              />
            )}
            {result.amountCents !== undefined && (
              <Receipt name={name} amountCents={result.amountCents} wallet={paidWallet} counted={counted} />
            )}
            <button type="button" className="btn btn-secondary btn-lg" onClick={startOver}>
              Make another payment
            </button>
          </>
        )}
        <div hidden={Boolean(result)} className="flex flex-col gap-5">
          <ProgramTicket spec={spec} slug={slug} />
          <MenuPicker
            menu={menu}
            spec={spec}
            item={item}
            onSelect={setItem}
            amount={amount}
            onAmount={setAmount}
            disabled={busy || paused}
          />
          <section aria-labelledby="pay-title" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between" style={{ padding: "0 4px" }}>
              <h2 id="pay-title" className="text-2" style={{ fontSize: 15, fontWeight: 500 }}>
                Total
              </h2>
              <span className="kpi-value" style={{ fontSize: 26 }}>
                {totalValid ? money(selectedCents) : "—"}
              </span>
            </div>
            {paused ? (
              <p className="banner banner-info">
                {name} isn&apos;t taking payments on this page right now.
              </p>
            ) : (
              <div
                className="card wallets"
                style={
                  {
                    "--paypal-button-border-radius": "10px",
                    "--venmo-button-border-radius": "10px",
                  } as CSSProperties
                }
              >
                <div
                  ref={buttons}
                  className="wallet-slot"
                  aria-busy={busy}
                  hidden={methods === 0}
                  style={{ pointerEvents: busy ? "none" : "auto" }}
                />
                <p className="status-line flex items-center gap-2" role="status" aria-live="polite">
                  {busy && <span className="spinner" aria-hidden="true" />}
                  {status}
                </p>
                {retry && !result && (
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={checkAgain}>
                    Check payment again
                  </button>
                )}
                <p className="caption" style={{ textAlign: "center" }}>
                  You confirm the payment in PayPal or Venmo. No sign-up, no app.
                </p>
              </div>
            )}
          </section>
        </div>
        <PayFooter slug={slug} spec={spec} sandbox={sandbox} />
      </div>
    </main>
  );
}
