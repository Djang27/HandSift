import { defineConfig } from "wxt";

function workerUrl(): string | undefined {
  // Typed as string for app code (builds fail without it), but may be unset at config time.
  const url: string | undefined = import.meta.env.WXT_WORKER_URL;
  return url;
}

// Chrome match patterns ignore ports, so localhost:8787 becomes http://localhost/*.
function toHostPermission(url: string): string {
  const { protocol, hostname } = new URL(url);
  return `${protocol}//${hostname}/*`;
}

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  imports: false,
  zip: { artifactTemplate: "handsift-{{version}}-{{browser}}.zip" },
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
});
