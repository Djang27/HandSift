import { defineConfig } from "wxt";

function workerUrl(): string | undefined {
  return import.meta.env.WXT_WORKER_URL as string | undefined;
}

// Chrome match patterns ignore ports, so localhost:8787 becomes http://localhost/*.
function toHostPermission(url: string): string {
  const { protocol, hostname } = new URL(url);
  return `${protocol}//${hostname}/*`;
}

export default defineConfig({
  srcDir: "src",
  imports: false,
  manifest: () => {
    const url = workerUrl();
    return {
      name: "HandSift: AI Filter for Etsy",
      short_name: "HandSift",
      description: "Flags, blurs, or hides AI-generated listings on Etsy, and explains why.",
      permissions: ["storage"],
      host_permissions: ["*://*.etsy.com/*", ...(url ? [toHostPermission(url)] : [])],
    };
  },
  hooks: {
    // `wxt prepare` (postinstall, typecheck) doesn't need the Worker URL; real builds do.
    "build:manifestGenerated": () => {
      if (!workerUrl()) {
        throw new Error("WXT_WORKER_URL is not set. See apps/extension/.env.development.");
      }
    },
  },
  vite: () => ({
    oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  }),
});
