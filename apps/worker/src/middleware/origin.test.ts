import { describe, expect, it } from "vitest";
import { checkOrigin } from "./origin";

const req = (origin?: string) =>
  new Request("https://w.test/v1/listings", origin ? { headers: { Origin: origin } } : {});

describe("checkOrigin", () => {
  it("allows requests without an Origin header", () => {
    expect(checkOrigin(req(), "")).toBeNull();
  });

  it("allows any extension when no IDs are configured", () => {
    expect(checkOrigin(req("chrome-extension://abc"), "")).toBeNull();
  });

  it("blocks web page origins", () => {
    expect(checkOrigin(req("https://evil.example"), "")?.status).toBe(403);
  });

  it("allows only configured extension IDs when set", () => {
    expect(checkOrigin(req("chrome-extension://abc"), "abc, def")).toBeNull();
    expect(checkOrigin(req("chrome-extension://xyz"), "abc,def")?.status).toBe(403);
  });
});
