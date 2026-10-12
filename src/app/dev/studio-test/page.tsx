import { notFound } from "next/navigation";
import { sandboxToolsEnabled } from "@/lib/env";
import StudioLoader from "./studio-loader";
export const dynamic = "force-dynamic";
export default function Page() {
  if (!sandboxToolsEnabled()) notFound();
  return <main className="p-6"><h1 className="mb-4 text-2xl font-semibold">Demo dashboard</h1><StudioLoader /></main>;
}
