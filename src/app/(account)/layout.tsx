import Link from "next/link";
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="account-shell">
      <Link href="/" className="merchant-wordmark">
        Kickback
      </Link>
      <section className="merchant-card">{children}</section>
      <p className="merchant-muted">Loyalty that starts with a payment.</p>
    </main>
  );
}
