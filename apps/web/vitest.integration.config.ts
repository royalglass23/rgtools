import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, defaultExclude } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    exclude: [...defaultExclude, "tests/e2e/**"],
  },
  resolve: {
    alias: [
      {
        find: "@rgtools/db/schema-leads",
        replacement: path.resolve(
          __dirname,
          "../../packages/db/src/schema-leads.ts",
        ),
      },
      {
        find: "@rgtools/db/schema-ps-generator",
        replacement: path.resolve(
          __dirname,
          "../../packages/db/src/schema-ps-generator.ts",
        ),
      },
      {
        find: "@rgtools/db/schema-workorders",
        replacement: path.resolve(
          __dirname,
          "../../packages/db/src/schema-workorders.ts",
        ),
      },
      {
        find: "@rgtools/db/schema",
        replacement: path.resolve(__dirname, "../../packages/db/src/schema.ts"),
      },
      {
        find: "@rgtools/db",
        replacement: path.resolve(__dirname, "../../packages/db/src/index.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, ".") },
    ],
  },
});
