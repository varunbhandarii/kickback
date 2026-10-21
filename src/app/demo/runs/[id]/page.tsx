export const metadata = { title: "Live demo run", robots: { index: false } };
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { runView } from "@/lib/demo/runs";
import RunTracker from "./run-tracker";
export const dynamic = "force-dynamic";
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const run = await runView((await params).id);
  if (!run) notFound();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1" style={{ paddingBlock: "48px 72px" }}>
        <div className="site-section-inner flex flex-col gap-8" style={{ maxWidth: 760 }}>
          <div className="flex flex-col gap-2">
            <span className="eyebrow" style={{ color: "var(--forest)" }}>
              Live sandbox run
            </span>
            <h1 className="page-title">Watch a reward happen</h1>
            <p className="page-sub" style={{ fontSize: 16 }}>
              A demo customer at visit 4 of 5 pays Rosa&apos;s Cafe. Every step below is a real PayPal sandbox call.
            </p>
          </div>
          <RunTracker initial={run} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
