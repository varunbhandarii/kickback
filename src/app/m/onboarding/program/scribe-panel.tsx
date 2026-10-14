"use client";
import { useState, useTransition } from "react";
import type { ProgramSpec } from "@/lib/engine/program";
import { writeCopy } from "./ai-actions";
export default function ScribePanel({
  merchantId,
  spec,
  onUse,
}: {
  merchantId: string;
  spec: ProgramSpec;
  onUse: (spec: ProgramSpec, id: string) => void;
}) {
  const [error, setError] = useState(""),
    [pending, start] = useTransition();
  return (
    <section className="merchant-card">
      <h2>Thank-you copy</h2>
      <p>
        Generate six notes, a terms introduction and a sign pitch in your saved
        voice. Copy becomes public only when you activate the program below.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const form = new FormData();
            form.set("merchantId", merchantId);
            form.set("spec", JSON.stringify(spec));
            const response = await writeCopy(form);
            if (response.result) {
              const r = response.result;
              onUse(
                {
                  ...spec,
                  noteVariants: r.notes,
                  termsIntro: r.termsIntro,
                  workedExamples: r.workedExamples,
                  signPitch: r.signPitch,
                },
                r.id,
              );
              if (r.fallback) setError("Validated templates are being used.");
            } else setError(response.error ?? "Copy unavailable.");
          })
        }
      >
        {pending ? "Writing and validating…" : "Generate or regenerate copy"}
      </button>
      {error && <p role="status">{error}</p>}
    </section>
  );
}
