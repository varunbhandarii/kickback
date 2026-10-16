import { signProgressToken } from "../crypto/progress-token";
import { getEnv } from "../env";
export function progressLink(
  merchant: { id: string; slug: string },
  key?: string | null,
) {
  return key
    ? new URL(
        `/pay/${merchant.slug}/progress?t=${signProgressToken(merchant.id, key)}`,
        getEnv().APP_URL,
      ).href
    : undefined;
}
