import type { Scorer } from "./scorer";

/**
 * Interim scorer until Phase 6: always "unclear" (which shows no badge), but keeps the
 * reasons of signals that hit so they can be logged. Never produces a wrong badge.
 */
export const unscored: Scorer = ({ listing, signals, checkedAt }) => ({
  listingId: listing.listingId,
  level: "unclear",
  score: 0,
  reasons: signals.filter((s) => s.hit).map((s) => s.reason),
  checkedAt,
});
