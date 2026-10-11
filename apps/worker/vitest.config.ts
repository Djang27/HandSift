import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      // Tests never call the real Etsy API; this only satisfies the required secret.
      miniflare: { bindings: { ETSY_API_KEY: "test-keystring:test-secret" } },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
