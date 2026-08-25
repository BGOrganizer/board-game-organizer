import { describe, expect, it } from "vitest";
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
