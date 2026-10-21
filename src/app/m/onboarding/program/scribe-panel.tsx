"use client";
import { useState, useTransition } from "react";
import type { ProgramSpec } from "@/lib/engine/program";
import { writeCopy } from "./ai-actions";
import { Icon } from "@/components/icons";
import { useReadOnly } from "@/components/demo-lock";
export default function ScribePanel({
  merchantId,
  spec,
  onUse,
}: {
  merchantId: string;
  spec: ProgramSpec;
  onUse: (spec: ProgramSpec, id: string) => void;
}) {
  const readOnly = useReadOnly();
  const [error, setError] = useState(""),
    [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-2" style={{ fontSize: 14, lineHeight: 1.55 }}>
        Generate six notes, a terms introduction and a sign pitch in your saved voice. Copy becomes public only when
        you activate the program.
      </p>
      <button
        type="button"
        className="btn btn-tint btn-sm self-start"
        disabled={pending || readOnly}
        aria-busy={pending || undefined}
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
        {pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkles" size={14} />}
        {pending ? "Writing and validating…" : "Write notes in your voice"}
      </button>
      {error && (
        <p role="status" className="status-line">
          {error}
        </p>
      )}
    </div>
  );
}
