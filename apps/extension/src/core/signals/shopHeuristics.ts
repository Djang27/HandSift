import { SHOP_HEURISTICS as H, SIGNAL_WEIGHTS, type ShopData, type Signal } from "@handsift/shared";
import type { SignalModule } from "@handsift/shared/interfaces";

const ID = "shopHeuristics";
const CAP = SIGNAL_WEIGHTS.shopHeuristics;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Clue {
  weight: number;
  reason: string;
}

/**
 * Weak-to-moderate signal from the shop as a whole: a brand-new shop with a huge catalog,
 * a catalog of almost only digital downloads, or very few sales for its size. Each clue is
 * weak (plenty of honest shops match one); they combine as 1 - product(1 - w), capped.
 */
export const shopHeuristics: SignalModule = {
  id: ID,
  kind: "inference",
  defaultWeight: CAP,
  evaluate({ shop, fetchedAt }): Signal {
    const clues = shop ? findClues(shop, fetchedAt) : [];
    if (clues.length === 0) {
      return {
        id: ID,
        kind: "inference",
        weight: 0,
        hit: false,
        reason: shop ? "Nothing unusual about the shop" : "No shop data",
      };
    }
    const combined = 1 - clues.reduce((miss, c) => miss * (1 - c.weight), 1);
    return {
      id: ID,
      kind: "inference",
      weight: Math.min(combined, CAP),
      hit: true,
      reason: `Shop: ${clues.map((c) => c.reason).join("; ")}`,
    };
  },
};

function findClues(shop: ShopData, fetchedAt: number): Clue[] {
  const clues: Clue[] = [];
  const listings = shop.activeListingCount;
  const ageDays = Math.max(0, (fetchedAt - shop.createdAt) / DAY_MS);

  if (ageDays < H.newShopMaxAgeDays && listings >= H.bulkMinListings) {
    clues.push({
      weight: H.newBulkWeight,
      reason: `opened ${formatAge(ageDays)} ago and already has ${String(listings)} listings`,
    });
  }
  if (
    listings >= H.digitalMinListings &&
    shop.digitalListingCount / listings >= H.digitalMinShare
  ) {
    clues.push({
      weight: H.digitalWeight,
      reason: `almost all of its ${String(listings)} listings are digital downloads`,
    });
  }
  if (listings >= H.lowSalesMinListings && shop.salesCount / listings < H.lowSalesMaxPerListing) {
    clues.push({
      weight: H.lowSalesWeight,
      reason: `few sales for its size (${String(shop.salesCount)} sales across ${String(listings)} listings)`,
    });
  }
  return clues;
}

function formatAge(days: number): string {
  if (days < 1) return "today";
  if (days < 60) return `${String(Math.round(days))} days`;
  return `${String(Math.round(days / 30))} months`;
}
