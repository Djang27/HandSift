import type { ItemSource } from "@handsift/shared/interfaces";

/** Wraps an ItemSource and logs what it fetched to the service worker console. */
export function withLogging(source: ItemSource): ItemSource {
  return {
    async getListings(ids) {
      const lookup = await source.getListings(ids);
      console.info(
        `[HandSift] Worker lookup: ${String(ids.length)} requested, ${String(lookup.results.length)} found, ` +
          `${String(lookup.missing.length)} missing, ${String(lookup.unavailable.length)} unavailable`,
      );
      if (lookup.results.length > 0) {
        console.table(
          lookup.results.map(({ listing, shop }) => ({
            id: listing.listingId,
            title: listing.title.slice(0, 60),
            whoMade: listing.whoMade,
            type: listing.listingType,
            partner: listing.hasProductionPartner,
            shopSales: shop?.salesCount ?? null,
          })),
        );
      }
      return lookup;
    },
  };
}
