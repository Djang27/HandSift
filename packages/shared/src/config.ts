// All tunables live here: weights, thresholds, TTLs, batch sizes, concurrency.

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a stored verdict stays fresh in the client cache. */
export const VERDICT_TTL_MS = 7 * DAY_MS;
