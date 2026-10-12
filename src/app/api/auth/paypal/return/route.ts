import { sandboxToolsEnabled } from "@/lib/env";
export async function GET() {
  if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ message: "Copy the authorization code from this URL into the local identity verification command. This endpoint does not create an authenticated session." }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
