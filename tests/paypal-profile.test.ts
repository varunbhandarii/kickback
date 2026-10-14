import { describe, expect, it } from "vitest";
import { normalizePayPalProfile } from "@/lib/paypal/identity-profile";

describe("PayPal merchant identity profile", () => {
  it("accepts standard email claims and explicit verification", () => {
    expect(
      normalizePayPalProfile({
        name: " Test Merchant ",
        email: " Owner@Example.com ",
        email_verified: true,
      }),
    ).toEqual({
      name: "Test Merchant",
      email: "owner@example.com",
      emailVerified: true,
    });
  });
  it("selects the primary legacy email and does not infer verification from the account", () => {
    expect(
      normalizePayPalProfile({
        name: "Merchant",
        verified_account: true,
        emails: [
          { value: "other@example.com" },
          { value: "owner@example.com", primary: true },
        ],
      }),
    ).toEqual({
      name: "Merchant",
      email: "owner@example.com",
      emailVerified: false,
    });
  });
  it("accepts a single legacy address without a primary marker", () => {
    expect(
      normalizePayPalProfile({ emails: [{ value: "owner@example.com" }] })
        .email,
    ).toBe("owner@example.com");
  });
  it("does not choose an ambiguous or invalid address", () => {
    expect(
      normalizePayPalProfile({
        emails: [
          { value: "first@example.com", primary: true },
          { value: "second@example.com", primary: true },
        ],
      }),
    ).not.toHaveProperty("email");
    expect(
      normalizePayPalProfile({
        emails: [
          { value: "first@example.com" },
          { value: "second@example.com" },
        ],
      }),
    ).not.toHaveProperty("email");
    expect(
      normalizePayPalProfile({
        email: "not-an-email",
        emails: [{ value: "also-invalid", primary: true }],
      }),
    ).not.toHaveProperty("email");
  });
});
