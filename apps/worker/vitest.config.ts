import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  // Relative to this package (pnpm runs tests from here).
  const migrations = await readD1Migrations("migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Tests never call the real Etsy API; this only satisfies the required secret.
          bindings: { ETSY_API_KEY: "test-keystring:test-secret", TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      include: ["src/**/*.test.ts"],
      setupFiles: ["./test/applyMigrations.ts"],
      restoreMocks: true,
    },
  };
});
