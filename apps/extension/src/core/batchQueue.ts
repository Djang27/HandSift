export interface BatchQueueOptions {
  /** Wait this long after the first new ID before flushing. */
  delayMs: number;
  /** Flush immediately once this many IDs are pending. */
  maxSize: number;
  flush: (ids: string[]) => void | Promise<void>;
}

export interface BatchQueue {
  /** Queues an ID unless it was already queued or sent on this page. */
  add(id: string): void;
  /** Lets these IDs be queued again (e.g. they came back unavailable). */
  release(ids: readonly string[]): void;
  /** Drops anything pending and stops the timer. */
  stop(): void;
}

/** Collects IDs into batches so scrolling sends a few requests, not one per card. */
export function createBatchQueue(options: BatchQueueOptions): BatchQueue {
  const seen = new Set<string>();
  let pending: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flushNow(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const batch = pending;
    pending = [];
    if (batch.length > 0) void options.flush(batch);
  }

  return {
    add(id) {
      if (seen.has(id)) return;
      seen.add(id);
      pending.push(id);
      if (pending.length >= options.maxSize) flushNow();
      else timer ??= setTimeout(flushNow, options.delayMs);
    },
    release(ids) {
      for (const id of ids) seen.delete(id);
    },
    stop() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = [];
    },
  };
}
