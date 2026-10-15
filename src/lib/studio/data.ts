import type { AgDataSourcesDefinition, AgFieldDefinition } from "ag-studio";
import { sourceFields, tableDescriptions, type StudioTable } from "./sources";
import type { KickbackRegistry } from "./widgets/registry";
export function cockpitData(): AgDataSourcesDefinition<KickbackRegistry> {
  const formats: Record<string, AgFieldDefinition<KickbackRegistry>["format"]> =
    {
      text: "textFormat",
      datetime: "dateTimeFormat",
      date: "dateFormat",
      integer: "integerFormat",
      currency: "currencyFormat",
      percentage: "percentageFormat",
      boolean: "booleanFormat",
    };
  return {
    description:
      "Kickback loyalty data for one business. Customers are pseudonymous codes; there are no names or contacts. Demo history is labeled.",
    sources: [
      {
        id: "kickback",
        name: "Loyalty",
        dataShape: "row",
        capabilities: { filter: true, sort: true, pagination: true },
        pageSize: 500,
        tables: (Object.keys(sourceFields) as StudioTable[]).map((id) => ({
          id,
          name: id.replaceAll("_", " "),
          description: tableDescriptions[id],
          fields: Object.entries(sourceFields[id]).map(([name, kind]) => ({
            id: name,
            name: name.replaceAll("_", " "),
            format: formats[kind],
            hide: ["key", "id", "customer_key"].includes(name),
            ...(kind === "currency"
              ? { formatOptions: { format: "$#,##0.00" } }
              : {}),
            ...([
              "status",
              "state",
              "source",
              "wallet",
              "weekday",
              "tier",
            ].includes(name)
              ? { cardinality: "low" as const }
              : {}),
          })),
        })),
        getData: async (table, fields, options) => {
          const qualified = fields.map((f) =>
            f.includes(".") ? f : `${table}.${f}`,
          );
          const r = await fetch("/api/studio/query", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ table, fields: qualified, options }),
            cache: "no-store",
          });
          const result = await r.json();
          if (!r.ok)
            throw new Error(
              typeof result.error === "string"
                ? result.error
                : "Data unavailable",
            );
          for (const row of result.data)
            for (const [key, value] of Object.entries(row)) {
              const kind = (
                sourceFields[table as StudioTable] as Record<string, string>
              )[key];
              if (
                value !== null &&
                ["integer", "currency", "percentage"].includes(kind)
              )
                row[key] = Number(value);
            }
          return result;
        },
      },
    ],
    relationships: ["visits", "rewards"].map((table) => ({
      id: table + "_customer",
      source: { tableId: table, fieldId: "customer_key" },
      target: { tableId: "customers", fieldId: "key" },
      type: "many-to-one",
    })),
  };
}
