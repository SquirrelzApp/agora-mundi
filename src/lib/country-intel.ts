import { prisma } from "@/lib/prisma";
import { getWorldCountryMetaByCode } from "@/lib/world-countries";

/**
 * Live Country Intelligence Service (Zero API Keys, Fast Cached, English-Only)
 * 1. English Wikipedia REST v1 (en.wikipedia.org): Real country overview & thumbnail
 * 2. Wikidata P1082: Current official country population
 * 3. Open ExchangeRate API (open.er-api.com): Live USD exchange rates for all currencies
 */

let cachedRates: {
  fetchedAt: number;
  rates: Record<string, number>;
} | null = null;

async function getUsdExchangeRates(): Promise<Record<string, number> | null> {
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  if (cachedRates && Date.now() - cachedRates.fetchedAt < SIX_HOURS_MS) {
    return cachedRates.rates;
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { "User-Agent": "globeTake/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return cachedRates?.rates || null;
    const data = await res.json();
    if (data?.rates && typeof data.rates === "object") {
      cachedRates = {
        fetchedAt: Date.now(),
        rates: data.rates as Record<string, number>,
      };
      return cachedRates.rates;
    }
  } catch {
    // ignore network hiccup
  }
  return cachedRates?.rates || null;
}

const WIKI_EN_TITLE_OVERRIDES: Record<string, string> = {
  GE: "Georgia_(country)",
  XK_NCY: "Northern_Cyprus",
  XK: "Kosovo",
  US: "United_States",
  GB: "United_Kingdom",
  PS: "Palestine",
  CD: "Democratic_Republic_of_the_Congo",
  CG: "Republic_of_the_Congo",
  KR: "South_Korea",
  KP: "North_Korea",
  CZ: "Czech_Republic",
  AE: "United_Arab_Emirates",
  ZA: "South_Africa",
  TR: "Turkey",
  CI: "Ivory_Coast",
  MK: "North_Macedonia",
  TW: "Taiwan",
};

async function fetchWikipediaSummary(
  code: string,
  name: string
): Promise<{
  summary: string | null;
  wikiUrl: string | null;
  thumbnailUrl: string | null;
}> {
  const enSlug =
    WIKI_EN_TITLE_OVERRIDES[code] || name.trim().replace(/\s+/g, "_");

  try {
    const enUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      enSlug
    )}`;
    const res = await fetch(enUrl, {
      headers: {
        "User-Agent": "globeTake/1.0 (https://globetake.app; contact@globetake.app)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.extract === "string" && data.extract.length > 40) {
        return {
          summary: data.extract.slice(0, 650),
          wikiUrl:
            data?.content_urls?.desktop?.page ||
            `https://en.wikipedia.org/wiki/${encodeURIComponent(enSlug)}`,
          thumbnailUrl: data?.thumbnail?.source || null,
        };
      }
    }
  } catch {
    // ignore network error
  }

  return { summary: null, wikiUrl: null, thumbnailUrl: null };
}

async function fetchWikidataPopulation(name: string): Promise<number | null> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=${encodeURIComponent(
      name
    )}&props=claims&format=json`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "globeTake/1.0 (https://globetake.app; contact@globetake.app)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const entities = json?.entities;
    if (!entities || typeof entities !== "object") return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstEntity = Object.values(entities)[0] as any;
    const p1082 = firstEntity?.claims?.P1082;
    if (!Array.isArray(p1082) || p1082.length === 0) return null;

    // Pick preferred rank if present, otherwise the most recent claim
    const preferred =
      p1082.find((c: { rank?: string }) => c.rank === "preferred") ||
      p1082[p1082.length - 1];
    const rawAmount = preferred?.mainsnak?.datavalue?.value?.amount;
    if (typeof rawAmount === "string") {
      const num = Number(rawAmount.replace(/^\+/, ""));
      if (Number.isFinite(num) && num > 500) {
        return num;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

const inFlightIntelMap = new Map<string, Promise<void>>();

export async function ensureCountryIntelligence(
  countryCode: string
): Promise<void> {
  const code = countryCode.toUpperCase();
  const inFlight = inFlightIntelMap.get(code);
  if (inFlight) return inFlight;

  const task = (async () => {
    try {
      const country = await prisma.country.findUnique({ where: { code } });
      if (!country) return;

      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const isFresh =
        country.infoSyncedAt &&
        Date.now() - country.infoSyncedAt.getTime() < TWENTY_FOUR_HOURS_MS &&
        Boolean(country.summary);

      if (isFresh) return;

      const meta = getWorldCountryMetaByCode(code);
      const name = country.name || meta?.name || code;
      const currencyCode = country.currencyCode || meta?.currencyCode || null;

      const [wiki, population, rates] = await Promise.all([
        country.summary
          ? Promise.resolve({
              summary: country.summary,
              wikiUrl: country.wikiUrl,
              thumbnailUrl: country.thumbnailUrl,
            })
          : fetchWikipediaSummary(code, name),
        country.population
          ? Promise.resolve(country.population)
          : fetchWikidataPopulation(name),
        getUsdExchangeRates(),
      ]);

      let usdRate: number | null = country.usdRate;

      if (rates && currencyCode && rates[currencyCode]) {
        usdRate = rates[currencyCode]; // 1 USD = X local currency
      }

      await prisma.country.update({
        where: { code },
        data: {
          summary: wiki.summary ?? country.summary,
          wikiUrl: wiki.wikiUrl ?? country.wikiUrl,
          thumbnailUrl: wiki.thumbnailUrl ?? country.thumbnailUrl,
          population: population ?? country.population,
          usdRate,
          infoSyncedAt: new Date(),
        },
      });
    } catch (err) {
      console.warn(`[ensureCountryIntelligence] Warning for ${code}:`, err);
    } finally {
      inFlightIntelMap.delete(code);
    }
  })();

  inFlightIntelMap.set(code, task);
  return task;
}
