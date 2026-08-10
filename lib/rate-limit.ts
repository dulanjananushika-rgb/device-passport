type RateBucket = { count: number; resetAt: number };

const globalRateLimits = globalThis as typeof globalThis & { devicePassportRateLimits?: Map<string, RateBucket> };
const buckets = globalRateLimits.devicePassportRateLimits ?? new Map<string, RateBucket>();
globalRateLimits.devicePassportRateLimits = buckets;

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    cleanExpiredBuckets(now);
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  current.count += 1;
  const allowed = current.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - current.count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

export function requestRateKey(request: Request, scope: string, discriminator = "") {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "local";
  return `${scope}:${address.slice(0, 80)}:${discriminator.trim().toLowerCase().slice(0, 120)}`;
}

function cleanExpiredBuckets(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}
