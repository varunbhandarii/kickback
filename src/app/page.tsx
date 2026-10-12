import Link from "next/link";
export default function Home() {
  return <main className="mx-auto max-w-3xl p-10">
    <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Kickback</p>
    <h1 className="mt-6 text-5xl font-semibold leading-tight">A little thank-you<br />for coming back.</h1>
    <p className="mt-6 max-w-xl text-xl text-slate-600">Payment-linked loyalty for small merchants on PayPal and Venmo.</p>
    <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6"><h2 className="text-xl font-semibold">Try a sandbox purchase</h2><p className="mt-3 text-slate-600">Pay at Rosa&apos;s Cafe, collect qualifying visits, and receive a thank-you refund. Use a PayPal sandbox buyer account.</p><Link className="mt-6 inline-block rounded-xl bg-emerald-800 px-5 py-3 text-white" href="/pay/rosas">Visit Rosa&apos;s Cafe →</Link></div>
    <nav className="mt-8 flex gap-6 text-blue-700"><Link href="/api/health">Service health</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav>
  </main>;
}
