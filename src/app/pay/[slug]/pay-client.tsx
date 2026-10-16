"use client";
import Script from "next/script";
import Link from "next/link";
import {
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
};
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
        button.setAttribute(
          "class",
          wallet === "paypal" ? "paypal-gold" : "venmo-blue",
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
      if (!resumed)
        setStatus(
          count
            ? "Choose a wallet to pay"
            : "No eligible wallet. Try a supported PayPal browser or device.",
        );
    }
    init().catch(() => {
      if (!cancelled)
        setStatus("Unable to load payment methods. Please refresh.");
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
    reward = result?.reward;
  return (
    <main className="pay-shell">
      <Script
        src={`https://${sandbox ? "www.sandbox" : "www"}.paypal.com/web-sdk/v6/core`}
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => setStatus("Unable to load PayPal. Please refresh.")}
      />
      <div className="pay-brand">
        KICKBACK <span>{sandbox && "SANDBOX DEMO"}</span>
      </div>
      <header>
        <p className="pay-eyebrow">A little thanks for coming back</p>
        <h1>{name}</h1>
        {spec.signPitch && <p>{spec.signPitch}</p>}
        <p>
          {spec.type === "VISIT_MILESTONE"
            ? `Visit ${spec.n} times`
            : `Spend ${money(spec.spendCents)}`}{" "}
          in {spec.windowDays} days and get{" "}
          <strong>{money(spec.rewardCents)} back.</strong>
        </p>
      </header>
      <section className="pay-card" aria-label="Choose your purchase">
        <h2>What are you having?</h2>
        <div className="pay-menu">
          {menu.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={item === entry.id}
              disabled={busy || paused}
              onClick={() => setItem(entry.id)}
            >
              <span>{entry.name}</span>
              <strong>{money(entry.priceCents)}</strong>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={item === "other"}
            disabled={busy || paused}
            onClick={() => setItem("other")}
          >
            Other amount
          </button>
        </div>
        {item === "other" && (
          <label className="pay-amount">
            Amount in USD
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              aria-label="Amount in USD"
            />
          </label>
        )}
        <div
          ref={buttons}
          className="pay-wallets"
          aria-busy={busy}
          style={{
            pointerEvents: busy ? "none" : "auto",
            opacity: busy ? 0.5 : 1,
          }}
        />
        <p role="status" aria-live="polite">
          {status}
        </p>
        {retry && (
          <button
            className="pay-retry"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await capture(retry);
              } catch (e) {
                setStatus(e instanceof Error ? e.message : "Please try again");
              } finally {
                setBusy(false);
              }
            }}
          >
            Check payment again
          </button>
        )}
      </section>
      {result && (
        <section className="pay-thanks" aria-live="polite">
          <h2>Thanks for stopping by.</h2>
          {!result.recognized ? (
            <p>
              Pay with PayPal or Venmo to earn rewards. This purchase could not
              be linked to a wallet.
            </p>
          ) : reward ? (
            <p>
              {["SENT", "CONFIRMED"].includes(reward.state)
                ? `${money(reward.amountCents)} sent ✓`
                : reward.state === "OFFSET"
                  ? "Your reward was applied to an earlier returned purchase."
                  : reward.state === "CANCELLED"
                    ? "This reward is no longer eligible. See the program terms."
                    : ["FAILED", "HELD", "DEFERRED"].includes(reward.state)
                      ? "Your reward needs a check. Please contact the merchant."
                      : `${reward.kind === "WIN_BACK" ? "Welcome back — " : ""}${money(reward.amountCents)} is on its way back to your wallet.`}
            </p>
          ) : progress?.blocked ? (
            <p>
              Reward limit reached. Visits still count toward future rewards.
            </p>
          ) : (
            progress && (
              <>
                <p>
                  {progress.type === "VISIT_MILESTONE"
                    ? `Visit ${progress.current} of ${progress.target} — ${progress.target - progress.current} more for ${money(progress.rewardCents)} back`
                    : `${money(progress.current)} of ${money(progress.target)} — ${money(progress.target - progress.current)} more for ${money(progress.rewardCents)} back`}
                </p>
                <progress
                  aria-label="Reward progress"
                  max={progress.target}
                  value={progress.current}
                />
              </>
            )
          )}
          {result.recognized && result.progressUrl && (
            <div>
              <p>
                <a href={result.progressUrl}>
                  Save this link to check your visits
                </a>
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result.progressUrl!);
                    setLinkStatus("Link copied");
                  } catch {
                    setLinkStatus("Open the link above and bookmark it.");
                  }
                }}
              >
                Copy link
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator
                      .share({
                        title: `Your visits at ${name}`,
                        url: result.progressUrl,
                      })
                      .catch(() => {});
                  }}
                >
                  Share link
                </button>
              )}
              <p role="status">{linkStatus}</p>
              <p>
                Keep this link private. On your phone, use your browser menu to
                add it to your Home Screen.
              </p>
            </div>
          )}
        </section>
      )}
      <footer>
        <p>
          Qualifying purchases start at {money(spec.minTicketCents)}. Purchases
          within {spec.mergeWindowMin} minutes count as one visit.
        </p>
        <Link href={`/pay/${slug}/terms`}>Program terms</Link> ·{" "}
        <Link href={`/pay/${slug}/terms#why-refund`}>
          Why did I get a refund?
        </Link>{" "}
        · <Link href="/privacy">Privacy</Link>
        {sandbox && (
          <p>Use sandbox accounts only. Test balances have no real value.</p>
        )}
      </footer>
    </main>
  );
}
