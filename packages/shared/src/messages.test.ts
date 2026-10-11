import { describe, expect, it } from "vitest";
import { ExtensionMessageSchema } from "./messages";

describe("ExtensionMessageSchema", () => {
  it.each([{ type: "clearCache" }, { type: "getPageStats" }])("accepts %j", (msg) => {
    expect(ExtensionMessageSchema.parse(msg)).toEqual(msg);
  });

  it("accepts a checkListings message", () => {
    const msg = { type: "checkListings", ids: ["1317074462"] };
    expect(ExtensionMessageSchema.parse(msg)).toEqual(msg);
  });

  it.each([
    ["unknown type", { type: "nope", ids: ["1"] }],
    ["no ids", { type: "checkListings", ids: [] }],
    ["bad id", { type: "checkListings", ids: ["abc"] }],
    [
      "too many ids",
      { type: "checkListings", ids: Array.from({ length: 101 }, (_, i) => String(i + 1)) },
    ],
    ["not an object", "checkListings"],
  ])("rejects %s", (_, msg) => {
    expect(ExtensionMessageSchema.safeParse(msg).success).toBe(false);
  });
});
