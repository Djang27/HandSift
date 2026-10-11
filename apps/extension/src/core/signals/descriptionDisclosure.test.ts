import type { ListingData } from "@handsift/shared";
import { describe, expect, it } from "vitest";
import { labels, realInputs, syntheticInputs } from "../../../test/fixtures";
import { descriptionDisclosure, findDisclosure } from "./descriptionDisclosure";

function listing(overrides: Partial<ListingData>): ListingData {
  return {
    listingId: "1",
    shopId: "2",
    title: "",
    description: "",
    tags: [],
    materials: [],
    whoMade: "i_did",
    listingType: "physical",
    hasProductionPartner: false,
    ...overrides,
  };
}

describe("findDisclosure", () => {
  it.each([
    "This artwork is an original creation by artificial intelligence (AI) software!",
    "Created using AI technology in collaboration with a human artist.",
    "The Tired Giant, AI Generated Digital Wall Art",
    "Royal Pet Portrait | AI-generated | Printable",
    "Printable AI Art Print",
    "Made with Midjourney and edited by hand.",
    "Rendered in Stable Diffusion.",
    "Generated with DALL·E 3",
    "Created with Leonardo.ai",
    "Made using Adobe Firefly",
    "This is A.I. generated art.",
    "I am an AI artist.",
    "AI-assisted illustration",
    "Instant download, no physical item. Created with AI.",
  ])("finds a disclosure in %j", (text) => {
    expect(findDisclosure(text)).not.toBeNull();
  });

  it.each([
    "100% handmade, no AI used anywhere in my designs.",
    "This is not AI generated.",
    "Unlike AI-generated art, every piece is hand painted.",
    "Tired of AI art? Everything here is drawn by hand.",
    "All artwork is AI-free.",
    "Files included: SVG, PNG, AI, EPS, PDF",
    "Ai Weiwei inspired print",
    "Prompt shipping within 2 days",
    "Firefly mason jar night light",
    "Leonardo da Vinci Vitruvian Man print",
    "Robot poster for AI enthusiasts",
    "Hand-thrown stoneware mug",
    "",
  ])("finds no disclosure in %j", (text) => {
    expect(findDisclosure(text)).toBeNull();
  });
});

describe("descriptionDisclosure", () => {
  it("checks tags and materials, not just the description", () => {
    const fromTags = descriptionDisclosure.evaluate({
      listing: listing({ tags: ["AI artwork"] }),
      fetchedAt: 0,
    });
    expect(fromTags).toMatchObject({
      hit: true,
      reason: 'Seller disclosed AI in the tags: "ai artwork"',
    });

    const fromMaterials = descriptionDisclosure.evaluate({
      listing: listing({ materials: ["PNG", "AI Software"] }),
      fetchedAt: 0,
    });
    expect(fromMaterials).toMatchObject({
      hit: true,
      reason: 'Seller disclosed AI in the materials: "ai software"',
    });
  });

  it("treats each tag on its own, so tags can't combine into a phrase", () => {
    const signal = descriptionDisclosure.evaluate({
      listing: listing({ tags: ["ai", "art print"] }),
      fetchedAt: 0,
    });
    expect(signal.hit).toBe(false);
  });

  it("returns its id and configured weight whether or not it hits", () => {
    const miss = descriptionDisclosure.evaluate({ listing: listing({}), fetchedAt: 0 });
    expect(miss).toMatchObject({ id: "descriptionDisclosure", weight: 1, hit: false });
  });

  it.each(syntheticInputs().map((input) => [input.listing.listingId, input] as const))(
    "is correct on synthetic listing %s",
    (id, input) => {
      const expectedHit = ["1000000001", "1000000002", "1000000003"].includes(id);
      expect(descriptionDisclosure.evaluate(input).hit).toBe(expectedHit);
    },
  );

  const real = realInputs();
  const realLabels = labels();
  it.skipIf(real.length === 0).each(real.map((input) => [input.listing.listingId, input] as const))(
    "matches the hand label on real listing %s",
    (id, input) => {
      expect(descriptionDisclosure.evaluate(input).hit).toBe(realLabels.get(id) === "ai");
    },
  );
});
