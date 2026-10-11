import { logError } from "../log";
import { errorResponse } from "../responses";

/**
 * Per-IP rate limiting, the Worker's main abuse defense. Limits are per Cloudflare location
 * and configured on the binding in wrangler.toml. Fails open if the limiter itself errors,
 * since Etsy's own 429s still cap the damage.
 */
export async function checkRateLimit(
  request: Request,
  limiter: RateLimit,
): Promise<Response | null> {
  // The IP is only used as the limiter key; never log it.
  const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
  try {
    const { success } = await limiter.limit({ key });
    return success ? null : errorResponse("rate_limited", "Too many requests, slow down");
  } catch (error) {
    logError("rate_limiter_failed", error);
    return null;
  }
}
