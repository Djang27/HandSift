import { describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rateLimit";

function limiter(impl: RateLimit["limit"]): RateLimit {
  return { limit: impl };
}

const req = new Request("https://w.test/v1/listings", {
  headers: { "CF-Connecting-IP": "203.0.113.7" },
});

describe("checkRateLimit", () => {
  it("passes requests under the limit, keyed by client IP", async () => {
    const limit = vi.fn<RateLimit["limit"]>(() => Promise.resolve({ success: true }));
    expect(await checkRateLimit(req, { limit })).toBeNull();
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.7" });
  });

  it("returns 429 over the limit", async () => {
    const res = await checkRateLimit(
      req,
      limiter(() => Promise.resolve({ success: false })),
    );
    expect(res?.status).toBe(429);
    expect(await res?.json()).toMatchObject({ error: "rate_limited" });
  });

  it("fails open if the limiter errors", async () => {
    const rl = limiter(() => Promise.reject(new Error("limiter down")));
    expect(await checkRateLimit(req, rl)).toBeNull();
  });
});
