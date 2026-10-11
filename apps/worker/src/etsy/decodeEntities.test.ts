import { describe, expect, it } from "vitest";
import { decodeEntities } from "./decodeEntities";

describe("decodeEntities", () => {
  it("decodes named entities", () => {
    expect(decodeEntities("&quot;AI&quot; &amp; art &lt;3 it&#39;s")).toBe('"AI" & art <3 it\'s');
  });

  it("decodes decimal and hex entities", () => {
    expect(decodeEntities("caf&#233; &#x2014; &#X1F3A8;")).toBe("café — 🎨");
  });

  it("leaves unknown or invalid entities alone", () => {
    expect(decodeEntities("&bogus; &#xFFFFFFFF; 5 & 6")).toBe("&bogus; &#xFFFFFFFF; 5 & 6");
  });
});
