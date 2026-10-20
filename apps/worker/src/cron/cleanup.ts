import { logError, logEvent } from "../log";

/**
 * Deletes expired rows from the shared cache (hourly Cron Trigger). Etsy's terms say not
 * to keep data longer than needed; reads already ignore expired rows, this removes them.
 */
export async function cleanupExpiredRows(db: D1Database, now: number): Promise<void> {
  try {
    const result = await db
      .prepare("DELETE FROM listings_cache WHERE expires_at <= ?1")
      .bind(now)
      .run();
    logEvent("cache_cleanup", { deleted: result.meta.changes });
  } catch (error) {
    logError("cache_cleanup_failed", error);
  }
}
