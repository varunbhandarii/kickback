export const metadata = { title: "Page not found" };
import Link from "next/link";
import { BrandLink } from "@/components/brand";
import { State } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6" style={{ padding: "40px 16px" }}>
      <BrandLink size={22} withIcon />
      <div className="card w-full" style={{ maxWidth: 480 }}>
        <State
          icon="search"
          title="We couldn't find that page."
          action={
            <Link href="/" className="btn btn-primary">
              Go home
            </Link>
          }
        >
          <p>The link may be old or mistyped. If a shop gave you this link, ask them for a new one.</p>
        </State>
      </div>
    </main>
  );
}
