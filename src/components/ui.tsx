import type { ReactNode } from "react";
import type { Tone } from "@/lib/copy";
import { Icon, type IconName } from "./icons";
import { moneyShort, ordinal } from "@/lib/format";

/* ---------------------------------------------------------------- */
/* Chips                                                              */
/* ---------------------------------------------------------------- */
export function Chip({
  tone = "neutral",
  size = "md",
  icon,
  dot,
  children,
}: {
  tone?: Tone;
  size?: "sm" | "md";
  icon?: IconName;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`chip chip-${tone}${size === "sm" ? " chip-sm" : ""}`}>
      {dot && <span className="chip-dot" aria-hidden="true" />}
      {icon && <Icon name={icon} size={12} strokeWidth={3} />}
      {children}
    </span>
  );
}

const toneIcon: Partial<Record<Tone, IconName>> = {
  success: "check",
  warn: "alert",
  danger: "x",
  info: "clock",
};
/** Chip with the tone's default icon, for statuses. */
export function StatusChip({
  tone,
  label,
  size = "md",
}: {
  tone: Tone;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <Chip tone={tone} size={size} icon={toneIcon[tone]}>
      {label}
    </Chip>
  );
}

/* ---------------------------------------------------------------- */
/* Punch components                                                   */
/* ---------------------------------------------------------------- */
type PunchSize = "xs" | "sm" | "md" | "lg";
/**
 * A row of punches: filled visits, empty rings, and a reward punch at the end
 * showing the amount. `newest` marks the last filled punch; `animate` plays
 * the landing motion once.
 */
export function PunchRow({
  target,
  filled,
  rewardCents,
  size = "md",
  earned = false,
  newest = false,
  animate = false,
  spread = false,
  label,
}: {
  target: number;
  filled: number;
  rewardCents: number;
  size?: PunchSize;
  earned?: boolean;
  newest?: boolean;
  animate?: boolean;
  spread?: boolean;
  label?: string;
}) {
  const visits = Math.max(1, target) - 1;
  const done = earned ? visits : Math.max(0, Math.min(filled, visits));
  const description =
    label ??
    (earned
      ? `All ${target} punches filled; the ${moneyShort(rewardCents)} reward is earned`
      : `${Math.min(filled, target)} of ${target} punches filled; the ${ordinalWord(target)} pays ${moneyShort(rewardCents)} back`);
  // Very long cards read better as a bar than as dozens of punches.
  if (target > 24)
    return (
      <SpendBar current={earned ? target : Math.min(filled, target)} target={target} rewardCents={rewardCents} label={description} />
    );
  // Long cards shrink and wrap instead of overflowing a phone screen.
  const crowded = target > 7;
  if (crowded && size === "lg") size = "md";
  if (target > 10 && size === "md") size = "sm";
  const spreadOut = spread && !crowded;
  return (
    <div
      className={`punch-row${spreadOut ? " punch-row-spread" : ""}`}
      role="img"
      aria-label={description}
      style={size === "xs" ? { gap: 3 } : size === "sm" ? { gap: 6 } : undefined}
    >
      {Array.from({ length: visits }, (_, i) => {
        const isFilled = i < done;
        const isNewest = !earned && newest && i === done - 1;
        return (
          <span
            key={i}
            className={`punch punch-${size} ${isFilled ? (isNewest ? "punch-newest" : "punch-filled") : "punch-empty"}${isNewest && animate ? " punch-land" : ""}`}
          />
        );
      })}
      <span
        className={`punch punch-${size} ${earned ? "punch-earned" : "punch-reward"}${earned && (size === "lg" || size === "md") ? " punch-burst" : ""}${earned && animate ? " punch-land-late punch-burst-in" : ""}`}
      >
        {size === "xs" ? "" : moneyShort(rewardCents)}
      </span>
    </div>
  );
}

function ordinalWord(n: number) {
  const words = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
  return words[n] ?? ordinal(n);
}

/** Spend programs: a filled bar toward the target with the reward at the end. */
export function SpendBar({
  current,
  target,
  rewardCents,
  label,
}: {
  current: number;
  target: number;
  rewardCents: number;
  label?: string;
}) {
  const ratio = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
  return (
    <div
      className="spend-bar"
      role="img"
      aria-label={label ?? `$${(current / 100).toFixed(2)} of $${(target / 100).toFixed(2)} spent toward ${moneyShort(rewardCents)} back`}
    >
      <span className="spend-track">
        <span className="spend-fill" style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="spend-reward">{moneyShort(rewardCents)}</span>
    </div>
  );
}

/** Ticket-shaped card with side notches at the perforation. */
export function Ticket({
  top,
  children,
  className = "",
}: {
  top: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ticket ${className}`}>
      <div className="ticket-top">{top}</div>
      <div className="ticket-bottom">{children}</div>
    </div>
  );
}

/** Small punches plus "4 of 5" for tables and lists. */
export function MiniProgress({
  type,
  current,
  target,
  rewardCents,
}: {
  type: string;
  current: number;
  target: number;
  rewardCents: number;
}) {
  if (type === "SPEND_MILESTONE") {
    const ratio = target > 0 ? Math.min(1, current / target) : 0;
    return (
      <span className="mini-punches">
        <span
          aria-hidden="true"
          style={{ display: "inline-block", width: 64, height: 8, borderRadius: 999, background: "var(--surface-2)", position: "relative", overflow: "hidden" }}
        >
          <span style={{ position: "absolute", inset: 0, width: `${ratio * 100}%`, background: "var(--forest)" }} />
        </span>
        <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
          ${(current / 100).toFixed(2)} of ${(target / 100).toFixed(2)}
        </span>
      </span>
    );
  }
  const n = Math.max(1, Math.min(target, 12));
  return (
    <span className="mini-punches">
      <span aria-hidden="true" style={{ display: "inline-flex", gap: 3 }}>
        {Array.from({ length: n }, (_, i) =>
          i === n - 1 ? (
            <span key={i} className="punch punch-xs punch-reward" />
          ) : (
            <span key={i} className={`punch punch-xs ${i < current ? "punch-filled" : "punch-empty"}`} />
          ),
        )}
      </span>
      <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
        {current} of {target}
      </span>
      <span className="sr-only">visits toward {moneyShort(rewardCents)} back</span>
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Page structure                                                     */
/* ---------------------------------------------------------------- */
export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="form-actions">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  id,
  action,
  children,
  as: Tag = "h2",
}: {
  title: ReactNode;
  id?: string;
  action?: ReactNode;
  children: ReactNode;
  as?: "h2" | "h3";
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className="section" aria-labelledby={headingId} id={id}>
      <div className="section-head">
        <Tag id={headingId} className="section-title">
          {title}
        </Tag>
        {action}
      </div>
      {children}
    </section>
  );
}

export function State({
  icon = "info",
  tone = "default",
  title,
  children,
  action,
  as: Tag = "h1",
}: {
  icon?: IconName;
  tone?: "default" | "danger";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className="state">
      <span className={`state-icon${tone === "danger" ? " state-icon-danger" : ""}`}>
        <Icon name={icon} size={24} />
      </span>
      <Tag className="state-title">{title}</Tag>
      {children && <div className="state-body">{children}</div>}
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* KPIs                                                               */
/* ---------------------------------------------------------------- */
export function Kpi({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card kpi">
      <span className="kpi-label">{label}</span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="kpi-value">{value}</span>
        {sub && <span className="kpi-sub">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

/** Single-series sparkline drawn to scale, with an emphasized last point. */
export function Sparkline({
  values,
  label,
  height = 44,
}: {
  values: number[];
  label: string;
  height?: number;
}) {
  const w = 240,
    h = height,
    pad = 4;
  const max = Math.max(1, ...values);
  const n = values.length;
  if (n < 2)
    return <div className="spark" style={{ height }} role="img" aria-label={label} />;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (n - 1);
  const y = (v: number) => h - 2 - (v / max) * (h - pad * 2);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[n - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ height }}>
      <line x1={0} y1={h - 2} x2={w} y2={h - 2} className="spark-base" />
      <polygon className="spark-area" points={`${x(0)},${h - 2} ${line} ${x(n - 1)},${h - 2}`} />
      <polyline className="spark-line" points={line} />
      <circle cx={x(n - 1)} cy={y(last)} r={3.5} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Value against a guideline tick and an optional hard limit. */
export function Meter({
  value,
  max,
  guideline,
  limit,
  labels,
  label,
}: {
  value: number;
  max: number;
  guideline?: number;
  limit?: number;
  labels?: { at: number; text: string }[];
  label: string;
}) {
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const over = limit !== undefined && value > limit;
  const warn = !over && guideline !== undefined && value > guideline;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="meter" role="img" aria-label={label}>
        <span className={`meter-fill${over ? " meter-fill-danger" : warn ? " meter-fill-warn" : ""}`} style={{ width: at(value) }} />
        {guideline !== undefined && <span className="meter-tick" style={{ left: at(guideline) }} />}
        {limit !== undefined && <span className="meter-tick meter-tick-limit" style={{ left: at(limit) }} />}
      </div>
      {labels && (
        <div className="meter-labels" aria-hidden="true">
          {labels.map((l, i) => (
            <span
              key={i}
              style={
                i === 0
                  ? { left: 0 }
                  : i === labels.length - 1 && l.at >= max
                    ? { right: 0 }
                    : { left: at(l.at), transform: "translateX(-50%)" }
              }
            >
              {l.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
