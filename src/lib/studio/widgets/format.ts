import type { AgExternalShape, AgFormatShapeParams } from "ag-studio";
export type CustomFormat = { title?: { enabled?: boolean; text?: string } };
export function customFormatShape({ api }: AgFormatShapeParams) {
  return api.defineAiCommand((s) => ({
    input: s.object({
      title: s
        .object({
          enabled: s.boolean().optional(),
          text: s.string().optional(),
        })
        .optional(),
    }),
    execute: () => ({ success: true, value: undefined }),
  })).shape as unknown as AgExternalShape<CustomFormat>;
}
