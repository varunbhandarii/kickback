"use client";
import { useActionState, useState, useSyncExternalStore } from "react";
import { slugFromName } from "@/lib/merchant-inputs";
import { submitBusiness, type BusinessState } from "./actions";
import { useTimeZones } from "@/components/use-time-zones";
const categories = [
  ["cafe", "Cafe", "Coffee, tea and quick bites"],
  ["bakery", "Bakery", "Bread, pastries and cakes"],
  ["salon", "Salon", "Hair, nails and beauty"],
  ["other", "Other", "Any other counter business"],
] as const;
function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}
export default function BusinessForm({
  business,
  host,
}: {
  business?: {
    id: string;
    displayName: string;
    slug: string;
    tz: string;
    category: string;
    slugLocked: boolean;
  };
  host?: string;
}) {
  const [name, setName] = useState(business?.displayName ?? ""),
    [slug, setSlug] = useState(business?.slug ?? ""),
    [edited, setEdited] = useState(Boolean(business)),
    [category, setCategory] = useState(business?.category ?? "cafe");
  const [state, submit, pending] = useActionState<BusinessState, FormData>(
    submitBusiness,
    {},
  );
  const zones = useTimeZones();
  // New businesses default to the browser's time zone once it is known.
  const detected = useSyncExternalStore(
    () => () => {},
    browserZone,
    () => "America/New_York",
  );
  return (
    <form action={submit} className="card card-pad form-stack">
      <input name="merchantId" type="hidden" value={business?.id ?? ""} />
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Business name</span>
          <input
            className="input"
            name="displayName"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!edited) setSlug(slugFromName(event.target.value));
            }}
            required
            maxLength={80}
            autoComplete="organization"
          />
        </label>
        <label className="field">
          <span className="field-label">Pay-link name</span>
          <input
            className="input mono"
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
            aria-describedby="slug-preview"
          />
          <span id="slug-preview" className="field-help">
            Customers will use <span className="mono">{host ?? ""}/pay/{slug || "your-business"}</span>.{" "}
            {business?.slugLocked ? "This printed link is locked." : "Choose a short name you can print on your sign."}
          </span>
        </label>
        <label className="field">
          <span className="field-label">Time zone</span>
          <input
            key={business ? "saved" : detected}
            className="input"
            name="tz"
            defaultValue={business?.tz ?? detected}
            list="time-zones"
            required
            aria-describedby="tz-help"
          />
          <datalist id="time-zones">
            {zones.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
          <span id="tz-help" className="field-help">
            Visits, budgets and reports use this time zone.
          </span>
        </label>
      </div>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="field-label" style={{ marginBottom: 10 }}>
          Business category
        </legend>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {categories.map(([value, label, detail]) => (
            <label key={value} className={`choice-card${category === value ? " choice-card-on" : ""}`}>
              <input
                type="radio"
                name="category"
                value={value}
                checked={category === value}
                onChange={() => setCategory(value)}
              />
              <span style={{ fontWeight: 600 }}>{label}</span>
              <span className="caption">{detail}</span>
            </label>
          ))}
        </div>
        <span className="field-help">Sets sensible starting rewards and a sample menu. You can change both.</span>
      </fieldset>
      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={pending} aria-busy={pending || undefined}>
          {pending && <span className="spinner" aria-hidden="true" />}
          {pending ? "Saving…" : "Continue"}
        </button>
      </div>
    </form>
  );
}
