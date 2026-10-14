import { z } from "zod";

export function normalizePayPalProfile(input: unknown) {
  const profile =
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : {},
    emails = Array.isArray(profile.emails) ? profile.emails : [],
    primary = emails.filter(
      (entry) => entry && typeof entry === "object" && entry.primary === true,
    ),
    candidates = [
      profile.email,
      ...(primary.length === 1 ? [primary[0].value] : []),
      ...(emails.length === 1 ? [emails[0]?.value] : []),
    ];
  let email: string | undefined;
  for (const candidate of candidates) {
    const parsed = z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .email()
      .safeParse(candidate);
    if (parsed.success) {
      email = parsed.data;
      break;
    }
  }
  return {
    ...(email ? { email } : {}),
    name:
      typeof profile.name === "string" && profile.name.trim()
        ? profile.name.trim().slice(0, 120)
        : "Merchant",
    // Account verification is not proof that this email address is verified.
    emailVerified: profile.email_verified === true,
  };
}
