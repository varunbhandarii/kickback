"use client";
import { useActionState, useState } from "react";
import type { MenuItem } from "@/db/schema";
import { submitMenu, downloadSign } from "./actions";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { money } from "@/lib/format";
import { useReadOnly } from "@/components/demo-lock";
export default function MenuForm({
  initial,
  finish = false,
  merchantId,
  minTicketCents,
}: {
  merchantId: string;
  initial: MenuItem[];
  slug?: string;
  finish?: boolean;
  minTicketCents?: number;
}) {
  const [items, setItems] = useState(initial),
    [state, action, pending] = useActionState(submitMenu, {});
  return (
    <form action={action} className="card card-pad form-stack">
      <input name="merchantId" type="hidden" value={merchantId} />
      <input type="hidden" name="finish" value={finish ? "yes" : "no"} />
      <div>
        <h2 className="card-title">Menu</h2>
        <p className="caption" style={{ fontSize: 13.5, marginTop: 2 }}>
          Customers pick from these on your pay page. They can also enter
          another amount.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((item, index) => {
          const counts =
            minTicketCents === undefined || item.priceCents >= minTicketCents;
          return (
            <li
              key={item.id}
              className="grid items-start gap-3"
              style={{ gridTemplateColumns: "minmax(0, 1fr) 132px 40px" }}
            >
              <input name="id" type="hidden" value={item.id} />
              <label className="field">
                <span className={index ? "sr-only" : "field-label"}>
                  {index ? `Item ${index + 1} name` : "Item name"}
                </span>
                <input
                  className="input"
                  name="name"
                  defaultValue={item.name}
                  maxLength={80}
                  required
                />
              </label>
              <label className="field">
                <span className={index ? "sr-only" : "field-label"}>
                  {index ? `Item ${index + 1} price` : "Price"}
                </span>
                <span className="affix">
                  <span className="affix-text">$</span>
                  <input
                    name="price"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={500}
                    step=".01"
                    className="num"
                    defaultValue={item.priceCents / 100}
                    aria-describedby={
                      minTicketCents !== undefined
                        ? `elig-${item.id}`
                        : undefined
                    }
                    onChange={(e) =>
                      setItems(
                        items.map((i) =>
                          i.id === item.id
                            ? {
                                ...i,
                                priceCents: Math.round(
                                  Number(e.target.value) * 100,
                                ),
                              }
                            : i,
                        ),
                      )
                    }
                    required
                  />
                </span>
                {minTicketCents !== undefined && (
                  <span
                    id={`elig-${item.id}`}
                    className="field-help"
                    style={counts ? { color: "var(--forest)" } : undefined}
                  >
                    {counts
                      ? "Counts as a visit"
                      : `Under ${money(minTicketCents)}, not a visit`}
                  </span>
                )}
              </label>
              <button
                type="button"
                className="icon-btn icon-btn-plain"
                style={{ marginTop: index ? 2 : 28 }}
                onClick={() => setItems(items.filter((i) => i.id !== item.id))}
                disabled={items.length <= 1}
                aria-label={`Remove ${item.name || `item ${index + 1}`}`}
                title="Remove"
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="btn btn-ghost btn-sm self-start"
        disabled={items.length >= 12}
        onClick={() =>
          setItems([
            ...items,
            {
              id: `item-${crypto.randomUUID().slice(0, 8)}`,
              name: "",
              priceCents: 100,
            },
          ])
        }
      >
        <Icon name="plus" size={16} />
        Add item
      </button>
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending && <span className="spinner" aria-hidden="true" />}
          {pending ? "Saving…" : finish ? "Save menu and finish" : "Save menu"}
        </button>
        {state.message && (
          <p role="status" className="status-line">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

/** Pay link and sign downloads. Printing or downloading locks the pay link. */
export function SignActions({
  merchantId,
  slug,
}: {
  merchantId: string;
  slug: string;
}) {
  const readOnly = useReadOnly();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <a
          className="btn btn-secondary btn-sm"
          href={`/pay/${slug}`}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="external" size={14} />
          Open pay page
        </a>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `${location.origin}/pay/${slug}`,
              );
              toast("Pay link copied");
            } catch {
              toast("Couldn't copy. Open the pay page and copy its address.");
            }
          }}
        >
          <Icon name="copy" size={14} />
          Copy pay link
        </button>
      </div>
      {readOnly ? (
        <div className="flex flex-wrap gap-2">
          <a
            className="btn btn-primary btn-sm"
            href={`/pay/${slug}/sign`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="printer" size={14} />
            View the printable sign
          </a>
          <a
            className="btn btn-secondary btn-sm"
            href={`/api/pay/${slug}/qr.png?download=1`}
            download
          >
            <Icon name="download" size={14} />
            Download QR (PNG)
          </a>
        </div>
      ) : (
        <form action={downloadSign} className="flex flex-wrap gap-2">
          <input name="merchantId" type="hidden" value={merchantId} />
          <button
            type="submit"
            name="format"
            value="sign"
            className="btn btn-primary btn-sm"
          >
            <Icon name="printer" size={14} />
            Print sign
          </button>
          <button
            type="submit"
            name="format"
            value="qr"
            className="btn btn-secondary btn-sm"
          >
            <Icon name="download" size={14} />
            Download QR (PNG)
          </button>
        </form>
      )}
      <p className="caption" style={{ fontSize: 13 }}>
        Your pay link is locked after the first sign or QR download so printed
        signs keep working. Save menu changes before downloading.
      </p>
    </div>
  );
}
