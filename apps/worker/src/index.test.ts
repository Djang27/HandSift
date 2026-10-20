import { createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import worker from "./index";

// Entry-level wiring tests (fetch routes are covered in router.test.ts).
describe("worker entry: scheduled", () => {
  it("runs the hourly cache cleanup from the cron trigger", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO listings_cache (listing_id, data, fetched_at, expires_at) VALUES ('7000000004', '{}', 0, 1)",
    ).run();
    await worker.scheduled(
      createScheduledController({ cron: "0 * * * *", scheduledTime: 1_800_000_000_000 }),
      env,
    );
    const row = await env.DB.prepare(
      "SELECT 1 FROM listings_cache WHERE listing_id = '7000000004'",
    ).first();
    expect(row).toBeNull();
  });
});
