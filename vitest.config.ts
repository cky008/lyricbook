import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@app": path.join(rootDir, "apps/web/src"),
      "@domain": path.join(rootDir, "packages/domain/src"),
      "@print": path.join(rootDir, "packages/print-engine/src"),
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./tests/unit/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "packages/domain/src/**/*.ts",
        "packages/print-engine/src/**/*.ts",
        "apps/web/src/lib/archive.ts",
        "apps/web/src/lib/projectHelpers.ts",
      ],
      exclude: ["**/*.d.ts", "**/index.ts"],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 65,
        lines: 70,
      },
    },
  },
});
