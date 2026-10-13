"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireFormMerchant } from "@/lib/merchant-form";
import {
  connectByo,
  ConnectionInputError,
  refreshPartnerConnection,
  startPartnerConnection,
} from "@/lib/connections";
export type ConnectState = { error?: string; message?: string };
async function consentIp(form: FormData) {
  if (form.get("consent") !== "on") throw new Error("Consent is required");
  return (
    (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  );
}
export async function submitPartner(
  _state: ConnectState,
  form: FormData,
): Promise<ConnectState> {
  const { user, merchant } = await requireFormMerchant(form);
  let url: string;
  try {
    url = await startPartnerConnection(
      user.id,
      merchant.id,
      await consentIp(form),
    );
  } catch {
    return {
      error:
        "PayPal connection could not start. Confirm consent and try again.",
    };
  }
  redirect(url);
}
export async function submitByo(
  _state: ConnectState,
  form: FormData,
): Promise<ConnectState> {
  const { user, merchant } = await requireFormMerchant(form);
  try {
    await connectByo(
      user.id,
      merchant.id,
      {
        clientId: form.get("clientId"),
        clientSecret: form.get("clientSecret"),
        merchantIdInPayPal: form.get("merchantIdInPayPal"),
      },
      await consentIp(form),
    );
  } catch (error) {
    return {
      error:
        error instanceof ConnectionInputError
          ? error.message
          : "Unable to validate this connection. Check your Merchant ID, app credentials, checkout/refund features, and available webhook slots. The same PayPal account cannot belong to two connected businesses.",
    };
  }
  redirect("/m/onboarding/history");
}
export async function recheckPartner(
  _state: ConnectState,
  form: FormData,
): Promise<ConnectState> {
  void _state;
  const { merchant } = await requireFormMerchant(form);
  try {
    const connection = await refreshPartnerConnection(merchant.id);
    return {
      message:
        connection?.status === "CONNECTED"
          ? "PayPal confirmed your connection."
          : "PayPal has not confirmed the required permissions and email yet.",
    };
  } catch {
    return {
      error:
        "PayPal verification is temporarily unavailable. Try again shortly.",
    };
  }
}
