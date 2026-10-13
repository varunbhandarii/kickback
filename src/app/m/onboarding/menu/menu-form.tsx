"use client";
import { useActionState, useState } from "react";
import type { MenuItem } from "@/db/schema";
import { submitMenu, downloadSign } from "./actions";
export default function MenuForm({
  initial,
  slug,
  finish = false,
  merchantId,
}: {
  merchantId: string;
  initial: MenuItem[];
  slug: string;
  finish?: boolean;
}) {
  const [items, setItems] = useState(initial),
    [state, action, pending] = useActionState(submitMenu, {});
  return (
    <section className="merchant-card">
      <h2>Menu & pay sign</h2>
      <form action={action}>
        <input name="merchantId" type="hidden" value={merchantId} />
        <input type="hidden" name="finish" value={finish ? "yes" : "no"} />
        {items.map((item) => (
          <div className="menu-edit-row" key={item.id}>
            <input name="id" type="hidden" value={item.id} />
            <label>
              Item name
              <input
                name="name"
                defaultValue={item.name}
                maxLength={80}
                required
              />
            </label>
            <label>
              Price (USD)
              <input
                name="price"
                type="number"
                min={1}
                max={500}
                step=".01"
                defaultValue={item.priceCents / 100}
                required
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => setItems(items.filter((i) => i.id !== item.id))}
              disabled={items.length <= 1}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
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
          Add item
        </button>
        {state.error && <p role="alert">{state.error}</p>}
        {state.message && <p role="status">{state.message}</p>}
        <button disabled={pending}>
          {pending ? "Saving…" : finish ? "Save menu & finish" : "Save menu"}
        </button>
      </form>
      <p>
        <a href={`/pay/${slug}`} target="_blank" rel="noreferrer">
          Open pay page
        </a>{" "}
        ·{" "}
        <button
          type="button"
          className="link-button"
          onClick={() =>
            navigator.clipboard.writeText(`${location.origin}/pay/${slug}`)
          }
        >
          Copy pay link
        </button>
      </p>
      <form action={downloadSign}>
        <input name="merchantId" type="hidden" value={merchantId} />
        <button name="format" value="sign" className="secondary">
          Download printable sign
        </button>{" "}
        <button name="format" value="qr" className="secondary">
          Download QR PNG
        </button>
      </form>
      <p className="muted">
        The pay link is locked after your first sign or QR download so printed
        signs keep working. Save menu changes before downloading.
      </p>
    </section>
  );
}
