import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLink } from "./brand";
import { Icon } from "./icons";

/** Slim header, one reading column, optional summary card. */
export function PolicyLayout({
  title,
  intro,
  summary,
  back = { href: "/", label: "Back to Kickback" },
  children,
}: {
  title: string;
  intro?: ReactNode;
  summary?: string[];
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="policy-head">
        <div className="policy-head-inner">
          <BrandLink size={20} withIcon />
          <Link href={back.href} className="btn btn-ghost btn-sm">
            <Icon name="arrowLeft" size={16} />
            {back.label}
          </Link>
        </div>
      </header>
      <main className="policy flex-1" style={{ paddingTop: 40 }}>
        <h1>{title}</h1>
        {intro}
        {summary && <SummaryCard lines={summary} />}
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <nav
          aria-label="Policies"
          className="mx-auto flex flex-wrap gap-x-6 gap-y-2"
          style={{ maxWidth: 760, padding: "20px max(16px, env(safe-area-inset-left, 0px)) 28px", fontSize: 14 }}
        >
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/ai">How Kickback uses AI</Link>
        </nav>
      </footer>
    </div>
  );
}

export function SummaryCard({ lines, title = "The short version" }: { lines: string[]; title?: string }) {
  return (
    <section className="card summary-card" aria-label={title}>
      <p className="eyebrow">{title}</p>
      <ul>
        {lines.map((line) => (
          <li key={line}>
            <Icon name="check" size={18} strokeWidth={2.5} style={{ color: "var(--forest)", flex: "none", marginTop: 3 }} />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
