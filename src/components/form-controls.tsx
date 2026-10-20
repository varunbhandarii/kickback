"use client";
import { useId, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Submit button that shows a spinner while its form's action runs. */
export function SubmitButton({
  children,
  className = "btn btn-primary",
  disabled,
  name,
  value,
  pendingLabel,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      name={name}
      value={value}
    >
      {pending && <span className="spinner" aria-hidden="true" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/**
 * A button that opens a confirmation dialog. Place it inside the form it
 * confirms: the dialog's confirm button submits that form.
 */
export function ConfirmButton({
  children,
  className = "btn btn-secondary",
  disabled,
  title,
  body,
  confirmLabel,
  confirmClassName = "btn btn-primary",
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmClassName?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => dialog.current?.showModal()}>
        {children}
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className="dialog-title">
          {title}
        </h2>
        <div className="dialog-body">{body}</div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className={confirmClassName} onClick={() => dialog.current?.close()}>
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
