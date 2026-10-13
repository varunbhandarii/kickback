import { z } from "zod";
import {
  defaultProgram,
  loadProgram,
  type ProgramSpec,
} from "./engine/program";
import type { MenuItem } from "@/db/schema";
const reserved = new Set([
  "api",
  "m",
  "pay",
  "dev",
  "admin",
  "sign-in",
  "sign-up",
  "privacy",
  "terms",
]);
export function slugFromName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f'’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/g, "");
}
export const slugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((value) => !reserved.has(value), "Choose another pay-link name");
export const businessSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .refine(
      (name) => !/[\r\n]|https?:\/\//i.test(name),
      "Use a plain text business name",
    ),
  slug: slugSchema,
  tz: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid time zone"),
  category: z.enum(["cafe", "salon", "bakery", "other"]),
});
export const menuSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]{1,40}$/),
      name: z.string().trim().min(1).max(80),
      priceCents: z.number().int().min(100).max(50000),
    }),
  )
  .min(1)
  .max(12)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Each item needs a unique ID",
  );
export function preset(category: string): ProgramSpec {
  return loadProgram(
    category === "salon"
      ? {
          ...defaultProgram,
          n: 4,
          rewardCents: 500,
          windowDays: 120,
          minTicketCents: 2000,
        }
      : category === "bakery"
        ? {
            ...defaultProgram,
            type: "SPEND_MILESTONE",
            spendCents: 4000,
            rewardCents: 300,
            windowDays: 45,
          }
        : { ...defaultProgram },
  );
}
export function defaultMenu(category: string): MenuItem[] {
  return category === "salon"
    ? [{ id: "cut", name: "Haircut", priceCents: 3500 }]
    : category === "bakery"
      ? [
          { id: "loaf", name: "Sourdough loaf", priceCents: 850 },
          { id: "croissant", name: "Croissant", priceCents: 450 },
        ]
      : [
          { id: "drip", name: "Drip coffee", priceCents: 365 },
          { id: "latte", name: "Latte", priceCents: 550 },
        ];
}
export function dollarsToCents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error("Enter an amount with at most two decimal places");
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Amount is too large");
  return result;
}
