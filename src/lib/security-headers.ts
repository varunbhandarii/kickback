export function securityHeaders(
  reportUrl?: string,
  appUrl = "http://localhost:3000",
) {
  let sink: URL | undefined;
  if (reportUrl) {
    sink = new URL(reportUrl);
    if (
      sink.protocol !== "https:" ||
      !/(^|\.)sentry\.io$/.test(sink.hostname) ||
      /[\r\n";]/.test(reportUrl)
    )
      throw new Error("Use the Sentry HTTPS security reporting endpoint");
  }
  const paypal =
    "https://*.paypal.com https://*.paypalobjects.com https://*.venmo.com";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${paypal}${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' ${paypal}`,
    `img-src 'self' data: blob: ${paypal}`,
    "font-src 'self' data:",
    `connect-src 'self' ${paypal}${sink ? " " + sink.origin : ""}${process.env.NODE_ENV === "development" ? " ws:" : ""}`,
    `frame-src ${paypal}`,
    `child-src ${paypal}`,
    `form-action 'self' https://*.paypal.com`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    ...(sink ? ["report-uri /api/security/csp", "report-to csp"] : []),
  ].join("; ");
  return [
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy-Report-Only", value: csp },
    ...(sink
      ? [
          {
            key: "Reporting-Endpoints",
            value: `csp="${new URL("/api/security/csp", appUrl).href}"`,
          },
        ]
      : []),
  ];
}
