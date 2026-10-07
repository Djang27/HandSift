// Architecture boundaries. Imports only flow downward:
//   ui / entrypoints -> adapters -> core -> packages/shared
// Type-only imports count too (tsPreCompilationDeps).

const EXT = "^apps/extension/src/";
const WORKER = "^apps/worker/src/";
const TEST_FILE = "\\.test\\.tsx?$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      // cloudflare:* are Workers runtime modules, resolved by workerd.
      to: { couldNotResolve: true, pathNot: "^cloudflare:" },
    },
    {
      name: "no-undeclared-dependencies",
      comment: "Every external import must be listed in the nearest package.json.",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "core-is-pure",
      comment:
        "core/ may only import core/, packages/shared, and zod. No adapters, UI, browser APIs, or Node builtins.",
      severity: "error",
      from: { path: `${EXT}core/`, pathNot: TEST_FILE },
      to: { pathNot: [`${EXT}core/`, "^packages/shared/src/", "/node_modules/zod/"] },
    },
    {
      name: "adapters-not-to-ui-or-entrypoints",
      severity: "error",
      from: { path: `${EXT}adapters/` },
      to: { path: `${EXT}(ui|entrypoints)/` },
    },
    {
      name: "ui-not-to-entrypoints",
      severity: "error",
      from: { path: `${EXT}ui/` },
      to: { path: `${EXT}entrypoints/` },
    },
    {
      name: "shared-is-a-leaf",
      comment: "packages/shared may only import itself and zod.",
      severity: "error",
      from: { path: "^packages/shared/src/", pathNot: TEST_FILE },
      to: { pathNot: ["^packages/shared/src/", "/node_modules/zod/"] },
    },
    {
      name: "apps-are-independent",
      comment: "The extension and the Worker share code only through packages/shared.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "worker-no-dom-interfaces",
      comment: "shared/interfaces uses DOM types that conflict with the Workers runtime.",
      severity: "error",
      from: { path: "^apps/worker/" },
      to: { path: "^packages/shared/src/interfaces\\.ts$" },
    },
    {
      name: "worker-lower-layers-not-to-routing",
      comment:
        "etsy/, cache/, middleware/, cron/ and log.ts must not import handlers, router, or the entry.",
      severity: "error",
      from: { path: `${WORKER}(etsy|cache|middleware|cron)/|${WORKER}log\\.ts$` },
      to: { path: `${WORKER}(handlers/|router\\.ts$|index\\.ts$)` },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      // Build output only. Anchored so packages' own dist/ folders in node_modules still resolve.
      path: "^(apps|packages)/[^/]+/(\\.output|\\.wxt|\\.wrangler|dist|coverage)/|worker-configuration\\.d\\.ts$",
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "require", "node", "default"],
      extensions: [".ts", ".tsx", ".d.ts", ".js", ".mjs", ".cjs", ".json"],
      mainFields: ["types", "module", "main"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
