/**
 * Minimal in-memory sliding-window rate limiter (per process).
 *
 * Good enough for the API's single-instance Vercel deployment; if the API
 * scales to multiple instances, move this to Redis/MongoDB. ponytail:
 * single-instance ceiling, upgrade when multi-instance.
 */
const buckets = new Map<string, { windowStart: number; count: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Avoid unbounded memory growth from stale buckets. */
export function pruneRateLimitBuckets(maxAgeMs = 60_000) {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= maxAgeMs) buckets.delete(key);
  }
}
