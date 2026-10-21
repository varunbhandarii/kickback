"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { selectBusiness } from "@/app/m/actions";
import { signOut } from "@/app/(account)/actions";
import { BrandLink, KickbackIcon } from "../brand";
import { Icon, type IconName } from "../icons";
import { Popover } from "./popover";
import { ThemeSwitch } from "./theme-switch";
import { Toaster } from "../toast";
import { ReadOnlyProvider } from "../demo-lock";

type Business = { id: string; name: string };
type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  prefetch?: boolean;
  badge?: number;
};

export function AppShell({
  user,
  businesses,
  current,
  sandbox,
  reviewCount,
  readOnly = false,
  children,
}: {
  user: { name: string; email: string };
  businesses: Business[];
  current?: Business & { slug: string };
  sandbox: boolean;
  reviewCount: number;
  readOnly?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Setup has its own focused frame without app navigation.
  if (pathname.startsWith("/m/onboarding"))
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  const rail = pathname.startsWith("/m/cockpit");
  const nav: NavItem[] = [
    { href: "/m", label: "Overview", icon: "overview", exact: true },
    { href: "/m/cockpit", label: "Cockpit", icon: "cockpit", prefetch: false },
    { href: "/m/rewards", label: "Rewards", icon: "rewards", badge: reviewCount },
    { href: "/m/customers", label: "Customers", icon: "customers" },
    { href: "/m/program", label: "Program", icon: "program" },
    { href: "/m/sign", label: "Pay page and sign", icon: "sign" },
    { href: "/m/settings", label: "Settings", icon: "settings" },
  ];
  const active = (item: { href: string; exact?: boolean }) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const help: NavItem = { href: "/m/help", label: "Help and tax notes", icon: "help" };
  const tabs = [nav[0], nav[2], nav[3]];
  const more = [nav[1], nav[4], nav[5], nav[6], help];
  const moreActive = more.some(active);

  return (
    <div className={`shell${rail ? " shell-rail cockpit-shell" : ""}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-secondary">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="App">
        <div className="sidebar-brand">
          <BrandLink href="/m" size={20} withIcon />
          {sandbox && <span className="chip chip-demo chip-sm">Sandbox</span>}
        </div>
        <Link href="/m" className="rail-logo" aria-label="Kickback overview" title="Kickback">
          <KickbackIcon size={40} />
        </Link>
        {current && <BusinessSwitcher businesses={businesses} current={current} />}
        <nav aria-label="Main" className="nav">
          {nav.map((item) => (
            <NavLink key={item.href} item={item} current={active(item)} />
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink item={help} current={active(help)} />
          <AccountMenu user={user} placement="up" readOnly={readOnly} />
        </div>
      </aside>

      <header className="topbar">
        <Link href="/m" aria-label="Kickback overview" className="flex-none">
          <KickbackIcon size={32} />
        </Link>
        <div className="min-w-0 flex-1">{current && <BusinessSwitcher businesses={businesses} current={current} compact />}</div>
        {sandbox && <span className="chip chip-demo chip-sm">Sandbox</span>}
        <AccountMenu user={user} placement="down" compact readOnly={readOnly} />
      </header>

      <main id="main" className="main" tabIndex={-1}>
        {readOnly && <DemoBanner shop={current?.name} />}
        <ReadOnlyProvider value={readOnly}>
          <div className={`main-inner${rail ? " main-wide" : ""}`}>{children}</div>
        </ReadOnlyProvider>
      </main>

      <nav aria-label="Tabs" className="bottom-tabs">
        {tabs.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={item.prefetch}
            className="tab-item"
            aria-current={active(item) ? "page" : undefined}
          >
            <Icon name={item.icon} size={22} />
            {item.label}
            {!!item.badge && (
              <span className="tab-badge" aria-label={`${item.badge} need review`}>
                {item.badge}
              </span>
            )}
          </Link>
        ))}
        <Popover
          label="More"
          placement="up"
          className="flex"
          triggerClassName={`tab-item w-full${moreActive ? " tab-item-active" : ""}`}
          trigger={
            <>
              <Icon name="more" size={22} />
              <span aria-hidden="true">More</span>
            </>
          }
        >
          {more.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.prefetch}
              className="menu-item"
              aria-current={active(item) ? "page" : undefined}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </Link>
          ))}
        </Popover>
      </nav>
      <Toaster />
    </div>
  );
}

/** Sticky notice for the read-only demo session. */
function DemoBanner({ shop }: { shop?: string }) {
  return (
    <div className="demo-banner" role="note">
      <Icon name="lock" size={16} />
      <span className="min-w-0 flex-1">
        You&apos;re exploring {shop ?? "a demo shop"} in a read-only demo. Changes are turned off; the
        Analyst and backtests still work.
      </span>
      <form action={signOut}>
        <button type="submit" className="btn btn-sm btn-on-band">
          Leave demo
        </button>
      </form>
    </div>
  );
}

function NavLink({ item, current }: { item: NavItem; current: boolean }) {
  return (
    <Link
      href={item.href}
      prefetch={item.prefetch}
      className="nav-item"
      aria-current={current ? "page" : undefined}
      title={item.label}
    >
      <Icon name={item.icon} size={20} />
      <span className="nav-label">{item.label}</span>
      {!!item.badge && (
        <span className="nav-badge" aria-label={`${item.badge} need review`}>
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function initial(name: string) {
  return (name.trim()[0] ?? "K").toUpperCase();
}

function BusinessSwitcher({
  businesses,
  current,
  compact = false,
}: {
  businesses: Business[];
  current: Business & { slug: string };
  compact?: boolean;
}) {
  const many = businesses.length > 1;
  return (
    <Popover
      label={many ? `Business: ${current.name}. Switch business` : `Business: ${current.name}`}
      triggerClassName="switcher-button"
      className={compact ? "min-w-0" : undefined}
      trigger={
        <>
          <span className="avatar" aria-hidden="true">
            {initial(current.name)}
          </span>
          <span className="switcher-text flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              {current.name}
            </span>
            {!compact && <span className="caption">{many ? "Switch business" : "Your business"}</span>}
          </span>
          <Icon name="chevronsUpDown" size={16} className="switcher-chevron" style={{ color: "var(--ink-3)", flex: "none" }} />
        </>
      }
    >
      {many && (
        <>
          <p className="menu-label">Businesses</p>
          {businesses.map((b) => (
            <form key={b.id} action={selectBusiness}>
              <input type="hidden" name="merchant" value={b.id} />
              <button type="submit" className="menu-item" aria-current={b.id === current.id ? "true" : undefined}>
                <span className="avatar" aria-hidden="true" style={{ width: 26, height: 26, fontSize: 12, borderRadius: 7 }}>
                  {initial(b.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                {b.id === current.id && <Icon name="check" size={16} label="Current business" />}
              </button>
            </form>
          ))}
          <div className="menu-divider" role="separator" />
        </>
      )}
      <a className="menu-item" href={`/pay/${current.slug}`} target="_blank" rel="noopener">
        <Icon name="external" size={16} />
        Open pay page
      </a>
      <Link className="menu-item" href="/m/settings#business">
        <Icon name="store" size={16} />
        Business settings
      </Link>
    </Popover>
  );
}

function AccountMenu({
  user,
  placement,
  compact = false,
  readOnly = false,
}: {
  user: { name: string; email: string };
  placement: "up" | "down";
  compact?: boolean;
  readOnly?: boolean;
}) {
  const name = readOnly ? "Demo visitor" : user.name || user.email;
  return (
    <Popover
      label="Account"
      placement={placement}
      triggerClassName={compact ? "icon-btn icon-btn-plain" : "nav-item w-full"}
      trigger={
        <>
          <span className="avatar avatar-round" aria-hidden="true">
            {initial(name)}
          </span>
          {!compact && (
            <span className="account-text nav-label min-w-0 truncate text-left" style={{ color: "var(--ink)" }}>
              {name}
            </span>
          )}
        </>
      }
    >
      <div style={{ padding: "8px 10px 10px" }}>
        <p className="caption">{readOnly ? "Read-only demo" : "Signed in as"}</p>
        <p className="truncate" style={{ fontSize: 14, fontWeight: 600 }}>
          {readOnly ? "Changes are turned off" : user.email}
        </p>
      </div>
      <p className="menu-label">Theme</p>
      <div style={{ padding: "0 6px 6px" }}>
        <ThemeSwitch />
      </div>
      <div className="menu-divider" role="separator" />
      {!readOnly && (
        <Link className="menu-item" href="/m/settings">
          <Icon name="settings" size={16} />
          Settings
        </Link>
      )}
      <form action={signOut}>
        <button type="submit" className="menu-item">
          <Icon name="logOut" size={16} />
          {readOnly ? "Leave demo" : "Sign out"}
        </button>
      </form>
    </Popover>
  );
}
