import { defineConfig } from "@playwright/test";

const CI = process.env.CI !== undefined;

// End-to-end tests: HandSift loaded in Chromium against a mock Worker (e2e/).
// Run with `pnpm test:e2e`, which builds the extension first.
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  // One mock Worker on a fixed port (the URL is baked into the build).
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
});
