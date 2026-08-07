import { config } from "dotenv";

// Loaded here (before defineConfig runs) so DATABASE_URL etc. point at the
// disposable test database for every process this config's own process
// spawns, including the global setup's `prisma migrate deploy` and the test
// workers forked from it.
config({ path: ".env.test" });

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: ["default", "json"],
    outputFile: { json: "./test-report.json" },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "json", "cobertura"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/main.ts",
        "src/**/*.module.ts",
        "src/**/*.spec.ts",
        "src/auth/**",
        "src/prisma/**",
      ],
    },
  },
});
