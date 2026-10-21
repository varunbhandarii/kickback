import Link from "next/link";
import { BrandLink, Wordmark } from "./brand";

/** Header for the public pages: landing, demo and status. */
export function SiteHeader({ home = false }: { home?: boolean }) {
  const anchor = (id: string) => (home ? `#${id}` : `/#${id}`);
  return (
    <header className="site-head">
      <div className="site-head-inner">
        <BrandLink size={24} withIcon />
        <nav aria-label="Main" className="site-nav">
          <a href={anchor("how")}>How it works</a>
          <a href={anchor("merchants")}>For merchants</a>
          <Link href="/demo">Try the demo</Link>
        </nav>
        <div className="flex items-center gap-2.5">
          <Link href="/sign-in" className="btn btn-ghost">
            Sign in
          </Link>
          <Link href="/sign-up" className="btn btn-primary">
            Connect your business
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface" style={{ paddingBlock: "32px 40px" }}>
      <div className="site-section-inner flex flex-wrap items-center justify-between gap-x-10 gap-y-4">
        <Wordmark size={20} />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2" style={{ fontSize: 14 }}>
          <Link href="/demo">Try the demo</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/ai">How Kickback uses AI</Link>
          <Link href="/status">Service status</Link>
        </nav>
        <p className="caption basis-full" style={{ fontSize: 13 }}>
          Kickback runs in PayPal sandbox today and has not processed live money. PayPal and Venmo are trademarks
          of PayPal, Inc.
        </p>
      </div>
    </footer>
  );
}
