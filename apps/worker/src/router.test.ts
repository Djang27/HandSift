import { ErrorResponseSchema, HealthResponseSchema } from "@handsift/shared";
import { exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { ListingsDeps } from "./handlers/listings";
import { route, type RouterDeps } from "./router";

// Through the real Worker entry (real wiring, bindings from wrangler.toml).
describe("worker entry", () => {
  it("GET /health returns ok", async () => {
    const res = await exports.default.fetch("https://worker.test/health");
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(await res.json())).toEqual({ status: "ok" });
  });

  it("unknown routes and non-GET return 404", async () => {
    for (const res of [
      await exports.default.fetch("https://worker.test/nope"),
      await exports.default.fetch("https://worker.test/health", { method: "POST" }),
      await exports.default.fetch("https://worker.test/listings?ids=1"),
    ]) {
      expect(res.status).toBe(404);
      expect(ErrorResponseSchema.parse(await res.json()).error).toBe("not_found");
    }
  });

  it("rejects invalid listing queries with 400", async () => {
    const res = await exports.default.fetch("https://worker.test/v1/listings?ids=abc");
    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(await res.json()).error).toBe("invalid_request");
  });

  it("blocks web-page origins with 403", async () => {
    const res = await exports.default.fetch("https://worker.test/v1/listings?ids=1", {
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });
});

// Router behavior with fakes.
function fakeDeps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  const listings: ListingsDeps = {
    cache: { get: () => Promise.resolve(new Map()), put: () => Promise.resolve() },
    fetchListings: vi.fn(),
    now: () => 0,
    waitUntil: () => undefined,
  };
  return {
    allowedExtensionIds: "",
    rateLimiter: { limit: () => Promise.resolve({ success: true }) },
    listings,
    ...overrides,
  };
}

describe("route", () => {
  it("returns 429 when the client is over the rate limit, without calling Etsy", async () => {
    const d = fakeDeps({ rateLimiter: { limit: () => Promise.resolve({ success: false }) } });
    const res = await route(new Request("https://w.test/v1/listings?ids=1"), d);
    expect(res.status).toBe(429);
    expect(d.listings.fetchListings).not.toHaveBeenCalled();
  });

  it("does not rate limit /health", async () => {
    const limit = vi.fn<RateLimit["limit"]>();
    const res = await route(
      new Request("https://w.test/health"),
      fakeDeps({ rateLimiter: { limit } }),
    );
    expect(res.status).toBe(200);
    expect(limit).not.toHaveBeenCalled();
  });

  it("turns unexpected exceptions into a 500 instead of crashing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const d = fakeDeps();
    d.listings.cache.get = () => Promise.reject(new Error("boom"));
    const res = await route(new Request("https://w.test/v1/listings?ids=1"), d);
    expect(res.status).toBe(500);
    expect(ErrorResponseSchema.parse(await res.json()).error).toBe("internal_error");
  });
});
