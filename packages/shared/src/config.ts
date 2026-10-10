// All tunables live here: weights, thresholds, TTLs, batch sizes, concurrency.

const HOUR_MS = 60 * 60 * 1000;

/**
 * How long a stored verdict stays fresh in the client cache. Etsy's API terms forbid
 * displaying listing content more than 6 hours older than Etsy's own site.
 */
export const VERDICT_TTL_MS = 6 * HOUR_MS;
