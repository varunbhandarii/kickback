"use client";
import { useActionState, useState } from "react";
import { slugFromName } from "@/lib/merchant-inputs";
import { submitBusiness, type BusinessState } from "./actions";
export default function BusinessForm({
  business,
}: {
  business?: {
    id: string;
    displayName: string;
    slug: string;
    tz: string;
    category: string;
    slugLocked: boolean;
  };
}) {
  const [name, setName] = useState(business?.displayName ?? ""),
    [slug, setSlug] = useState(business?.slug ?? ""),
    [edited, setEdited] = useState(Boolean(business));
  const [state, submit, pending] = useActionState<BusinessState, FormData>(
    submitBusiness,
    {},
  );
  return (
    <form action={submit} className="merchant-form">
      <input name="merchantId" type="hidden" value={business?.id ?? ""} />
      <label>
        Business name
        <input
          name="displayName"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!edited) setSlug(slugFromName(event.target.value));
          }}
          required
          maxLength={80}
        />
      </label>
      <label>
        Pay-link name
        <input
          name="slug"
          value={slug}
          onChange={(event) => {
            setEdited(true);
            setSlug(event.target.value);
          }}
          readOnly={business?.slugLocked}
          required
          minLength={3}
          maxLength={40}
          pattern="[a-z0-9-]+"
        />
        <span className="merchant-muted">
          Your customers will use /pay/{slug || "your-business"}.{" "}
          {business?.slugLocked
            ? "This printed link is locked."
            : "Choose a short name you can print on your sign."}
        </span>
      </label>
      <label>
        Time zone
        <input
          name="tz"
          defaultValue={business?.tz ?? "America/New_York"}
          list="time-zones"
          required
        />
        <datalist id="time-zones">
          {[
            "America/New_York",
            "America/Chicago",
            "America/Denver",
            "America/Los_Angeles",
            "Europe/London",
            "Asia/Kolkata",
            "UTC",
          ].map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
      </label>
      <label>
        Business category
        <select name="category" defaultValue={business?.category ?? "cafe"}>
          {["cafe", "salon", "bakery", "other"].map((value) => (
            <option key={value} value={value}>
              {value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </label>
      {state.error && (
        <p role="alert" className="merchant-error">
          {state.error}
        </p>
      )}
      <button className="merchant-primary" disabled={pending}>
        {pending ? "Saving…" : "Continue to PayPal"}
      </button>
    </form>
  );
}
