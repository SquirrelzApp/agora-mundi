import {
  countryCodeToLanguage,
  normalizeLanguageCode,
} from "@/lib/language-config";

export interface HeaderAccessor {
  get(name: string): string | null;
}

export interface DetectedVisitorLocale {
  lang: string;
  countryCode: string | null;
  source: "geo-header" | "ip-lookup" | "accept-language" | "default";
}

interface IpGeoCacheEntry {
  countryCode: string | null;
  expiresAt: number;
}

const IP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const IP_CACHE_MAX = 5000;

const globalForGeo = globalThis as unknown as {
  __agoraIpGeoCache?: Map<string, IpGeoCacheEntry>;
  __agoraIpGeoInFlight?: Map<string, Promise<string | null>>;
};

function getIpGeoCache(): Map<string, IpGeoCacheEntry> {
  if (!globalForGeo.__agoraIpGeoCache) {
    globalForGeo.__agoraIpGeoCache = new Map();
  }
  return globalForGeo.__agoraIpGeoCache;
}

function getIpGeoInFlight(): Map<string, Promise<string | null>> {
  if (!globalForGeo.__agoraIpGeoInFlight) {
    globalForGeo.__agoraIpGeoInFlight = new Map();
  }
  return globalForGeo.__agoraIpGeoInFlight;
}

export function isPrivateOrLocalIp(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase().replace(/^::ffff:/, "");
  if (!ip || ip === "unknown" || ip === "::1" || ip === "0:0:0:0:0:0:0:1") {
    return true;
  }
  if (
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("0.")
  ) {
    return true;
  }
  if (ip.startsWith("172.")) {
    const second = Number(ip.split(".")[1]);
    if (Number.isFinite(second) && second >= 16 && second <= 31) {
      return true;
    }
  }
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) {
    return true;
  }
  return false;
}

export function extractCountryFromHeaders(
  headers: HeaderAccessor
): string | null {
  const candidates = [
    headers.get("x-vercel-ip-country"),
    headers.get("cf-ipcountry"),
    headers.get("cloudfront-viewer-country"),
    headers.get("x-country-code"),
    headers.get("x-geo-country"),
    headers.get("x-appengine-country"),
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const upper = raw.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(upper) && upper !== "XX" && upper !== "T1" && upper !== "ZZ") {
      return upper;
    }
  }
  return null;
}

export function extractClientIpFromHeaders(headers: HeaderAccessor): string {
  const directCandidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-forwarded-for"),
    headers.get("x-real-ip"),
  ];

  for (const raw of directCandidates) {
    if (!raw) continue;
    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

export function parseAcceptLanguage(header?: string | null): string[] {
  if (!header || typeof header !== "string") return [];
  const entries = header
    .split(",")
    .map((part) => {
      const [tagPart, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return {
        lang: normalizeLanguageCode(tagPart),
        rawValid: /^[a-z]{2,3}(-[a-z0-9]{2,4})*$/i.test(tagPart.trim()),
        q: Number.isFinite(q) ? q : 0,
      };
    })
    .filter((e) => e.rawValid && e.q > 0)
    .sort((a, b) => b.q - a.q);

  const unique: string[] = [];
  for (const item of entries) {
    if (!unique.includes(item.lang)) unique.push(item.lang);
  }
  return unique;
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs = 1200
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupCountryByPublicIp(
  rawIp: string
): Promise<string | null> {
  const ip = rawIp.trim().replace(/^::ffff:/i, "");
  if (isPrivateOrLocalIp(ip)) return null;

  const cache = getIpGeoCache();
  const cached = cache.get(ip);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.countryCode;
  }

  const inFlight = getIpGeoInFlight();
  const existingPromise = inFlight.get(ip);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async () => {
    try {
      let resolved: string | null = null;

      const primary = await fetchJsonWithTimeout(
        `https://api.country.is/${encodeURIComponent(ip)}`,
        1200
      );
      if (
        primary &&
        typeof primary.country === "string" &&
        /^[A-Z]{2}$/i.test(primary.country)
      ) {
        resolved = primary.country.toUpperCase();
      }

      if (!resolved) {
        const secondary = await fetchJsonWithTimeout(
          `https://ipwho.is/${encodeURIComponent(ip)}?fields=country_code,success`,
          1200
        );
        if (
          secondary &&
          secondary.success === true &&
          typeof secondary.country_code === "string" &&
          /^[A-Z]{2}$/i.test(secondary.country_code)
        ) {
          resolved = secondary.country_code.toUpperCase();
        }
      }

      if (cache.size >= IP_CACHE_MAX) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }

      cache.set(ip, {
        countryCode: resolved,
        expiresAt: Date.now() + IP_CACHE_TTL_MS,
      });
      return resolved;
    } finally {
      inFlight.delete(ip);
    }
  })();

  inFlight.set(ip, promise);
  return promise;
}

/**
 * Automatically detects the visitor's region from CDN/proxy geo headers or public IP
 * and maps it to their regional language (with Accept-Language refinement/fallback).
 */
export async function detectVisitorLocale(
  headers: HeaderAccessor
): Promise<DetectedVisitorLocale> {
  const acceptLangs = parseAcceptLanguage(headers.get("accept-language"));

  // 1. Edge / Reverse-Proxy Geo Header (Vercel, Cloudflare, CloudFront, Nginx)
  const headerCountry = extractCountryFromHeaders(headers);
  if (headerCountry) {
    return {
      lang: countryCodeToLanguage(headerCountry, acceptLangs),
      countryCode: headerCountry,
      source: "geo-header",
    };
  }

  // 2. Direct Public IP Geolocation Lookup (when running without edge geo headers)
  const clientIp = extractClientIpFromHeaders(headers);
  if (!isPrivateOrLocalIp(clientIp)) {
    const ipCountry = await lookupCountryByPublicIp(clientIp);
    if (ipCountry) {
      return {
        lang: countryCodeToLanguage(ipCountry, acceptLangs),
        countryCode: ipCountry,
        source: "ip-lookup",
      };
    }
  }

  // 3. Browser Accept-Language fallback (local dev / private network / lookup timeout)
  if (acceptLangs.length > 0) {
    return {
      lang: acceptLangs[0],
      countryCode: null,
      source: "accept-language",
    };
  }

  // 4. Default English
  return {
    lang: "en",
    countryCode: null,
    source: "default",
  };
}
