import { z } from "zod";
export const pageId = "loyalty";
const object = z.record(z.string(), z.unknown());
export const cockpitStateSchema = z
  .object({
    version: z.string().max(30).optional(),
    selectedPageId: z.literal(pageId),
    pages: z
      .array(
        z
          .object({
            id: z.literal(pageId),
            widgets: object.optional(),
            widgetLayout: object.optional(),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();
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
