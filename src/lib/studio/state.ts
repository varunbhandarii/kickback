import { z } from "zod";
export const pageId = "loyalty";
const object = z.record(z.string(), z.unknown());
export const cockpitStateSchema = z
  .object({
    version: z.string().max(30).optional(),
    selectedPageId: z.enum(["loyalty", "risk"]),
    kpiDays: z.number().int().min(1).max(365).optional(),
    pages: z
      .array(
        z
          .object({
            id: z.enum(["loyalty", "risk"]),
            widgets: object.optional(),
            widgetLayout: object.optional(),
            filter: z
              .object({ widget: object.optional() })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .min(1)
      .max(2)
      .refine(
        (pages) =>
          pages.some((p) => p.id === "loyalty") &&
          new Set(pages.map((p) => p.id)).size === pages.length,
        "Pages must be unique and include loyalty",
      ),
  })
  .passthrough()
  .refine(
    (s) => s.pages.some((p) => p.id === s.selectedPageId),
    "Selected page must exist",
  );
export function validateState(state: unknown) {
  if (new TextEncoder().encode(JSON.stringify(state)).length > 262144)
    throw new Error("Layout exceeds 256 KB");
  const valid = cockpitStateSchema.parse(state);
  // Data connections are supplied by the application, never saved with a layout.
  if (
    valid.schema &&
    typeof valid.schema === "object" &&
    Object.hasOwn(valid.schema, "sources")
  )
    throw new Error("Layout cannot define data sources");
  return valid;
}
