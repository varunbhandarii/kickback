import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(
          process.env.SENTRY_CSP_REPORT_URL || undefined,
          process.env.APP_URL,
        ),
      },
      {
        source: "/pay/:slug/progress",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
