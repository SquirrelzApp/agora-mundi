import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

interface RateLimitBucket {
  timestamps: number[];
}

const globalForRateLimit = globalThis as unknown as {
  __globeTakeRateLimits?: Map<string, RateLimitBucket>;
  __globeTakeLastPrune?: number;
};

function getRateLimitStore(): Map<string, RateLimitBucket> {
  if (!globalForRateLimit.__globeTakeRateLimits) {
    globalForRateLimit.__globeTakeRateLimits = new Map();
  }
  return globalForRateLimit.__globeTakeRateLimits;
}

export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * In-memory sliding-window rate limiter with bounded memory pruning.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const store = getRateLimitStore();
  const now = Date.now();
  const windowStart = now - windowMs;

  // Periodically prune stale buckets to prevent unbounded growth
  const lastPrune = globalForRateLimit.__globeTakeLastPrune || 0;
  if (now - lastPrune > 60_000 && store.size > 500) {
    globalForRateLimit.__globeTakeLastPrune = now;
    for (const [k, bucket] of store.entries()) {
      const active = bucket.timestamps.filter((t) => t > now - 300_000);
      if (active.length === 0) store.delete(k);
      else bucket.timestamps = active;
    }
  }

  const bucket = store.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

  if (bucket.timestamps.length >= maxRequests) {
    const oldest = bucket.timestamps[0] || now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + windowMs - now) / 1000)
    );
    store.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.timestamps.push(now);
  store.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - bucket.timestamps.length),
    retryAfterSec: 0,
  };
}

/**
 * Constant-time verification of a provided token against CRON_SECRET.
 * Fails closed in production if CRON_SECRET is not configured.
 */
export function verifyCronSecretToken(
  providedToken: string | null | undefined,
  configuredSecret: string | undefined,
  isProduction: boolean
): { ok: boolean; status: number; error?: string } {
  if (!configuredSecret) {
    if (isProduction) {
      return {
        ok: false,
        status: 503,
        error: "Administrative sync endpoint is disabled (CRON_SECRET not set).",
      };
    }
    // Allow local dev convenience when CRON_SECRET is not configured
    return { ok: true, status: 200 };
  }

  if (!providedToken) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized. Valid authorization token is required.",
    };
  }

  const a = Buffer.from(providedToken);
  const b = Buffer.from(configuredSecret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized. Invalid authorization token.",
    };
  }

  return { ok: true, status: 200 };
}

export function requireCronOrAdminAuth(
  request: NextRequest
): NextResponse | null {
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const headerSecret = request.headers.get("x-cron-secret")?.trim() || null;
  const provided = bearer || headerSecret;

  const check = verifyCronSecretToken(
    provided,
    process.env.CRON_SECRET,
    process.env.NODE_ENV === "production"
  );

  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }
  return null;
}
