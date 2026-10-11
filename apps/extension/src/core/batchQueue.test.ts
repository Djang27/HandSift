import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBatchQueue } from "./batchQueue";

describe("batchQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(maxSize = 100) {
    const flush = vi.fn<(ids: string[]) => void>();
    return { flush, queue: createBatchQueue({ delayMs: 300, maxSize, flush }) };
  }

  it("collects IDs added within the delay into one batch", () => {
    const { flush, queue } = setup();
    queue.add("1");
    vi.advanceTimersByTime(200);
    queue.add("2");
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(flush).toHaveBeenCalledExactlyOnceWith(["1", "2"]);
  });

  it("flushes immediately at maxSize", () => {
    const { flush, queue } = setup(3);
    for (const id of ["1", "2", "3", "4"]) queue.add(id);
    expect(flush).toHaveBeenCalledExactlyOnceWith(["1", "2", "3"]);
    vi.advanceTimersByTime(300);
    expect(flush).toHaveBeenLastCalledWith(["4"]);
  });

  it("never sends the same ID twice on a page", () => {
    const { flush, queue } = setup();
    queue.add("1");
    queue.add("1");
    vi.advanceTimersByTime(300);
    queue.add("1");
    vi.advanceTimersByTime(300);
    expect(flush).toHaveBeenCalledExactlyOnceWith(["1"]);
  });

  it("lets released IDs be queued again", () => {
    const { flush, queue } = setup();
    queue.add("1");
    vi.advanceTimersByTime(300);
    queue.release(["1"]);
    queue.add("1");
    vi.advanceTimersByTime(300);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("drops pending IDs on stop", () => {
    const { flush, queue } = setup();
    queue.add("1");
    queue.stop();
    vi.advanceTimersByTime(1000);
    expect(flush).not.toHaveBeenCalled();
  });
});
