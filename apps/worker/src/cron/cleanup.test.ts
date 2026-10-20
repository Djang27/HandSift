import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { cleanupExpiredRows } from "./cleanup";

const NOW = 1_800_000_000_000;

async function insertRow(id: string, expiresAt: number): Promise<void> {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO listings_cache (listing_id, data, fetched_at, expires_at) VALUES (?1, '{}', ?2, ?3)",
  )
    .bind(id, NOW - 1000, expiresAt)
    .run();
}

async function exists(id: string): Promise<boolean> {
  return (
    (await env.DB.prepare("SELECT 1 FROM listings_cache WHERE listing_id = ?1")
      .bind(id)
      .first()) !== null
  );
}

describe("cleanupExpiredRows", () => {
  it("deletes expired rows, keeps fresh ones, and logs how many it deleted", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await insertRow("7000000001", NOW - 1);
    await insertRow("7000000002", NOW);
    await insertRow("7000000003", NOW + 60_000);

    await cleanupExpiredRows(env.DB, NOW);

    expect(await exists("7000000001")).toBe(false);
    expect(await exists("7000000002")).toBe(false);
    expect(await exists("7000000003")).toBe(true);
    expect(
      log.mock.calls.map(([line]) => String(line)).find((l) => l.includes("cache_cleanup")),
    ).toContain('"deleted":2');
  });

  it("logs instead of throwing when D1 fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = {
      prepare: () => ({ bind: () => ({ run: () => Promise.reject(new Error("down")) }) }),
    };
    await expect(cleanupExpiredRows(broken as unknown as D1Database, NOW)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
