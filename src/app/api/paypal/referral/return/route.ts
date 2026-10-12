import { sandboxToolsEnabled } from "@/lib/env";
export async function GET(request: Request) {
  if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const params = new URL(request.url).searchParams;
  // Redirect values are informative only; the server API confirms merchant status.
  return Response.json({ merchantIdInPayPal: params.get("merchantIdInPayPal"), permissionsGranted: params.get("permissionsGranted"), consentStatus: params.get("consentStatus"), isEmailConfirmed: params.get("isEmailConfirmed"), next: "Confirm merchant status using the local verification command." });
}
