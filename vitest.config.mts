import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": new URL(
        "./tests/helpers/server-only.ts",
        import.meta.url,
      ).pathname.replace(/^\/([A-Za-z]:\/)/, "$1"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    hookTimeout: 30000,
    maxWorkers: 4,
  },
});
