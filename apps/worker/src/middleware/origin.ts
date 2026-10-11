import { errorResponse } from "../responses";

// NOT a security boundary: any script can send any Origin header. This only stops web
// pages from calling the Worker from a browser. Per-IP rate limiting is the real defense.

const EXTENSION_SCHEME = "chrome-extension://";

/**
 * Allows requests with no Origin (non-browser callers) or from a Chrome extension. If
 * `allowedExtensionIds` (comma-separated) is set, only those extension IDs are allowed.
 */
export function checkOrigin(request: Request, allowedExtensionIds: string): Response | null {
  const origin = request.headers.get("Origin");
  if (origin === null) return null;
  if (!origin.startsWith(EXTENSION_SCHEME)) return errorResponse("forbidden");

  const allowed = allowedExtensionIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (allowed.length === 0) return null;
  return allowed.includes(origin.slice(EXTENSION_SCHEME.length))
    ? null
    : errorResponse("forbidden");
}
