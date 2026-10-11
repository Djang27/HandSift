import type { EtsyListing, EtsyShop, ListingData, ShopData } from "@handsift/shared";
import { decodeEntities } from "./decodeEntities";

export function toListingData(listing: EtsyListing): ListingData {
  return {
    listingId: String(listing.listing_id),
    shopId: String(listing.shop_id),
    title: decodeEntities(listing.title),
    description: decodeEntities(listing.description),
    tags: listing.tags,
    materials: listing.materials,
    whoMade: listing.who_made,
    listingType: listing.listing_type,
    hasProductionPartner: listing.production_partners.length > 0,
  };
}

export function toShopData(shop: EtsyShop): ShopData {
  return {
    shopId: String(shop.shop_id),
    createdAt: shop.create_date * 1000,
    activeListingCount: shop.listing_active_count,
    digitalListingCount: shop.digital_listing_count,
    salesCount: shop.transaction_sold_count,
  };
}
