import { describe, expect, it } from "vitest";
import { parseListingsQuery } from "./validate";

const parse = (query: string) => parseListingsQuery(new URL(`https://w.test/v1/listings${query}`));

describe("parseListingsQuery", () => {
  it("accepts comma-separated numeric IDs and removes duplicates", () => {
    expect(parse("?ids=1317074462,42,42")).toEqual({ ok: true, value: ["1317074462", "42"] });
  });

  it.each([
    ["no params", ""],
    ["empty ids", "?ids="],
    ["non-numeric", "?ids=abc"],
    ["leading zero", "?ids=0123"],
    ["zero", "?ids=0"],
    ["negative", "?ids=-5"],
    ["too long", `?ids=${"1".repeat(20)}`],
    ["trailing comma", "?ids=1,"],
    ["spaces", "?ids=1,%202"],
    ["unknown param", "?ids=1&foo=bar"],
    ["repeated ids param", "?ids=1&ids=2"],
  ])("rejects %s", (_, query) => {
    expect(parse(query).ok).toBe(false);
  });

  it("rejects more than 100 unique IDs but allows exactly 100", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1)).join(",");
    expect(parse(`?ids=${ids(100)}`).ok).toBe(true);
    expect(parse(`?ids=${ids(101)}`).ok).toBe(false);
  });
});
