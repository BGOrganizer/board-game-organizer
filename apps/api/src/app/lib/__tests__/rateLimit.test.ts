import { describe, expect, it, vi } from "vitest";
import { pruneRateLimitBuckets, rateLimit } from "../rateLimit";

describe("rateLimit", () => {
  it("allows up to the limit within the window", () => {
    pruneRateLimitBuckets(0);
    expect(rateLimit("k1", 3, 60_000).allowed).toBe(true);
    expect(rateLimit("k1", 3, 60_000).allowed).toBe(true);
    expect(rateLimit("k1", 3, 60_000).allowed).toBe(true);
    expect(rateLimit("k1", 3, 60_000).allowed).toBe(false);
    expect(rateLimit("k1", 3, 60_000).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    pruneRateLimitBuckets(0);
    expect(rateLimit("a", 1, 60_000).allowed).toBe(true);
    expect(rateLimit("a", 1, 60_000).allowed).toBe(false);
    expect(rateLimit("b", 1, 60_000).allowed).toBe(true);
  });

  it("reports remaining correctly", () => {
    pruneRateLimitBuckets(0);
    const r = rateLimit("k2", 5, 60_000);
    expect(r.remaining).toBe(4);
  });
});

it("prunes expired windows without resetting a still-active account bucket", () => {
  vi.useFakeTimers();
  try {
    pruneRateLimitBuckets(0);
    vi.setSystemTime(new Date("2030-01-01T12:00:00Z"));
    const maxAge = 1_000;
    expect(rateLimit("older", 1, maxAge).allowed).toBe(true);
    vi.advanceTimersByTime(500);
    expect(rateLimit("recent", 1, maxAge).allowed).toBe(true);
    vi.advanceTimersByTime(500);
    pruneRateLimitBuckets(maxAge);
    expect(rateLimit("older", 1, maxAge)).toMatchObject({ allowed: true, remaining: 0 });
    expect(rateLimit("recent", 1, maxAge)).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
  } finally {
    pruneRateLimitBuckets(0);
    vi.useRealTimers();
  }
});
