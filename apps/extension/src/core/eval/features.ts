import type { Signal, V1ListingResult, Verdict } from "@handsift/shared";

// Per-listing features for `pnpm eval --details`: what HandSift saw and how it scored it.
// Pure; not used by the extension at runtime.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ListingFeatures {
  id: string;
  score: number;
  level: Verdict["level"];
  /** The seller disclosed AI (a disclosure signal hit). */
  disclosed: boolean;
  /** IDs of inference signals that hit. */
  clues: string[];
  shopAgeDays: number | null;
  activeListings: number | null;
  /** 0 to 1. */
  digitalShare: number | null;
  salesPerListing: number | null;
  whoMade: string | null;
  productionPartner: boolean;
  listingType: string;
}

export function listingFeatures(
  { listing, shop, fetchedAt }: V1ListingResult,
  signals: readonly Signal[],
  verdict: Verdict,
): ListingFeatures {
  const listings = shop?.activeListingCount ?? null;
  const perListing = (n: number) => (listings ? n / listings : null);
  return {
    id: listing.listingId,
    score: verdict.score,
    level: verdict.level,
    disclosed: signals.some((s) => s.hit && s.kind === "disclosure"),
    clues: signals.filter((s) => s.hit && s.kind === "inference").map((s) => s.id),
    shopAgeDays: shop ? Math.max(0, Math.round((fetchedAt - shop.createdAt) / DAY_MS)) : null,
    activeListings: listings,
    digitalShare: shop ? perListing(shop.digitalListingCount) : null,
    salesPerListing: shop ? perListing(shop.salesCount) : null,
    whoMade: listing.whoMade,
    productionPartner: listing.hasProductionPartner,
    listingType: listing.listingType,
  };
}
