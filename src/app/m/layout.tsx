import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { signOut } from "../(account)/actions";
export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="merchant-shell">
      <header className="merchant-header">
        <Link href="/m" className="merchant-wordmark">
          Kickback
        </Link>
        <nav>
          <Link href="/m">Overview</Link>
          <Link href="/m/customers">Customers</Link>
          <Link href="/m/rewards">Rewards</Link>
          <Link href="/m/settings">Settings</Link>
        </nav>
        <form action={signOut}>
          <button className="merchant-link">Sign out</button>
        </form>
      </header>
      <main>
        <p className="merchant-muted">{user.name}</p>
        {children}
      </main>
    </div>
  );
}
