import { V1_LISTINGS_PATH } from "@handsift/shared";
import { handleHealth } from "./handlers/health";
import { handleListings, type ListingsDeps } from "./handlers/listings";
import { logError } from "./log";
import { checkOrigin } from "./middleware/origin";
import { checkRateLimit } from "./middleware/rateLimit";
import { errorResponse } from "./responses";

export interface RouterDeps {
  allowedExtensionIds: string;
  rateLimiter: RateLimit;
  listings: ListingsDeps;
}

export async function route(request: Request, deps: RouterDeps): Promise<Response> {
  try {
    const { pathname } = new URL(request.url);
    const isGet = request.method === "GET";

    if (isGet && pathname === "/health") return handleHealth();

    const blocked = checkOrigin(request, deps.allowedExtensionIds);
    if (blocked) return blocked;

    if (isGet && pathname === V1_LISTINGS_PATH) {
      const limited = await checkRateLimit(request, deps.rateLimiter);
      if (limited) return limited;
      return await handleListings(request, deps.listings);
    }

    return errorResponse("not_found");
  } catch (error) {
    logError("unhandled_error", error);
    return errorResponse("internal_error");
  }
}
