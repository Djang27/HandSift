import { ErrorResponseSchema, HealthResponseSchema } from "@handsift/shared";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("router", () => {
  it("GET /health returns ok", async () => {
    const res = await exports.default.fetch("https://worker.test/health");
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(await res.json())).toEqual({ status: "ok" });
  });

  it("unknown routes return 404", async () => {
    const res = await exports.default.fetch("https://worker.test/nope");
    expect(res.status).toBe(404);
    expect(ErrorResponseSchema.parse(await res.json())).toEqual({ error: "not_found" });
  });

  it("non-GET /health returns 404", async () => {
    const res = await exports.default.fetch("https://worker.test/health", { method: "POST" });
    expect(res.status).toBe(404);
  });
});
