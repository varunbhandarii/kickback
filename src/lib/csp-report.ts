const cleanUrl = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  if (["inline", "eval", "self", "none"].includes(value)) return value;
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol)
      ? u.origin + u.pathname
      : u.protocol;
  } catch {
    return undefined;
  }
};
export function sanitizeCspReport(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = Array.isArray(value)
    ? (value[0] as { body?: unknown })?.body
    : (value as { "csp-report"?: unknown })["csp-report"];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const directive =
    r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"];
  if (typeof directive !== "string" || !/^[a-z-]{1,80}$/.test(directive))
    return null;
  return {
    "csp-report": {
      "document-uri": cleanUrl(r["document-uri"] ?? r.documentURL),
      "blocked-uri": cleanUrl(r["blocked-uri"] ?? r.blockedURL),
      "source-file": cleanUrl(r["source-file"] ?? r.sourceFile),
      "effective-directive": directive,
      "violated-directive": directive,
      disposition: "report",
      "status-code":
        typeof r["status-code"] === "number" ? r["status-code"] : 200,
    },
  };
}
