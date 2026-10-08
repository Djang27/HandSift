import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Globals that touch the outside world. core/ and packages/shared must stay pure.
const IMPURE_GLOBALS = [
  "chrome",
  "browser",
  "fetch",
  "window",
  "document",
  "navigator",
  "location",
  "indexedDB",
  "localStorage",
  "sessionStorage",
  "XMLHttpRequest",
  "WebSocket",
  "caches",
].map((name) => ({
  name,
  message: "core/ and packages/shared are pure. Do I/O in an adapter and pass data in.",
}));

export default defineConfig(
  globalIgnores([
    "**/node_modules/",
    "**/.output/",
    "**/.wxt/",
    "**/.wrangler/",
    "**/dist/",
    "**/coverage/",
    "**/worker-configuration.d.ts",
  ]),
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "ExportDefaultDeclaration", message: "Use named exports only." },
      ],
    },
  },
  {
    // Frameworks require a default export from these files.
    files: [
      "**/*.config.ts",
      ".dependency-cruiser.ts",
      "apps/extension/src/entrypoints/**",
      "apps/worker/src/index.ts",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["apps/extension/src/core/**", "packages/shared/src/**"],
    rules: { "no-restricted-globals": ["error", ...IMPURE_GLOBALS] },
  },
);
