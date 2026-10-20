"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

/**
 * A disclosure button with a floating panel. The panel is fixed-positioned
 * from the trigger so it can leave the scrolling sidebar; it closes on
 * Escape, outside clicks, resizing, navigation and form submits.
 */
export function Popover({
  trigger,
  label,
  placement = "down",
  className = "",
  triggerClassName = "",
  panelClassName = "",
  children,
}: {
  trigger: ReactNode;
  label: string;
  placement?: "down" | "up";
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt !== null && openAt === pathname;
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    const el = panel.current,
      anchor = button.current;
    if (!open || !el || !anchor) return;
    const rect = anchor.getBoundingClientRect(),
      width = el.offsetWidth,
      height = el.offsetHeight,
      gap = 6,
      edge = 12;
    // Narrow triggers (the icon rail) open to the side.
    const side = rect.width < 80 && window.innerWidth >= 720;
    let left = side ? rect.right + gap + 2 : rect.left;
    left = Math.max(edge, Math.min(left, window.innerWidth - width - edge));
    let top: number;
    if (side) top = placement === "up" ? rect.bottom - height : rect.top;
    else top = placement === "up" ? rect.top - gap - height : rect.bottom + gap;
    top = Math.max(edge, Math.min(top, window.innerHeight - height - edge));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpenAt(null);
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div ref={root} className={`popover ${className}`}>
      <button
        ref={button}
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => setOpenAt(open ? null : pathname)}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="group"
          aria-label={label}
          className={`popover-panel ${panelClassName}`}
          style={{ visibility: "hidden", top: 0, left: 0 }}
          onSubmit={() => setOpenAt(null)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
