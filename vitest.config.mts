import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Bound CPU contention; the 101-publication audit is an intentional ~10s regression.
    maxWorkers: 2,
    testTimeout: 20000,
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
