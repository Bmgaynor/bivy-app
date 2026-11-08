import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vitest doesn't read tsconfig paths; mirror tsconfig.base.json's alias
  resolve: {
    alias: {
      "@bivy-app/sms-format": fileURLToPath(
        new URL("../../libs/sms-format/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    passWithNoTests: true,
    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../coverage/apps/api",
    },
  },
});
