import { prisma } from "@/lib/prisma";
import { translateWithGoogle } from "@/lib/google-translate";
import { getWorldCountryMetaByCode } from "@/lib/world-countries";

/**
 * Canlı Ülke İstihbarat Servisi (Sıfır API Anahtarı, Hızlı Önbellekli)
 * 1. Wikipedia REST v1 (tr.wikipedia.org + en.wikipedia.org yedeği): Gerçek ülke özeti ve görseli
 * 2. Wikidata P1082: Güncel resmi ülke nüfusu
 * 3. Open ExchangeRate API (open.er-api.com): Tüm para birimleri için canlı USD ve TRY kurları
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
      headers: { "User-Agent": "AgoraMundi/1.0" },
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

const WIKI_TR_TITLE_OVERRIDES: Record<string, string> = {
  XK_NCY: "Kuzey_Kıbrıs_Türk_Cumhuriyeti",
  XK: "Kosova",
  US: "Amerika_Birleşik_Devletleri",
  GB: "Birleşik_Krallık",
  PS: "Filistin_Devleti",
  CD: "Kongo_Demokratik_Cumhuriyeti",
  CG: "Kongo_Cumhuriyeti",
  KR: "Güney_Kore",
  KP: "Kuzey_Kore",
  CZ: "Çekya",
  AE: "Birleşik_Arap_Emirlikleri",
  ZA: "Güney_Afrika_Cumhuriyeti",
};

async function fetchWikipediaSummary(
  code: string,
  nameTr: string,
  nameEn: string
): Promise<{
  summaryTr: string | null;
  wikiUrl: string | null;
  thumbnailUrl: string | null;
}> {
  const trSlug =
    WIKI_TR_TITLE_OVERRIDES[code] || nameTr.trim().replace(/\s+/g, "_");

  // 1. Try Turkish Wikipedia REST v1
  try {
    const trUrl = `https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      trSlug
    )}`;
    const res = await fetch(trUrl, {
      headers: { "User-Agent": "AgoraMundi/1.0" },
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.extract === "string" && data.extract.length > 40) {
        return {
          summaryTr: data.extract.slice(0, 650),
          wikiUrl:
            data?.content_urls?.desktop?.page ||
            `https://tr.wikipedia.org/wiki/${encodeURIComponent(trSlug)}`,
          thumbnailUrl: data?.thumbnail?.source || null,
        };
      }
    }
  } catch {
    // Fallback to English Wikipedia
  }

  // 2. Fallback to English Wikipedia + Google Translate
  try {
    const enSlug = nameEn.trim().replace(/\s+/g, "_");
    const enUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      enSlug
    )}`;
    const res = await fetch(enUrl, {
      headers: { "User-Agent": "AgoraMundi/1.0" },
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.extract === "string" && data.extract.length > 40) {
        const trExtract = await translateWithGoogle(
          data.extract.slice(0, 500),
          "tr"
        );
        return {
          summaryTr: trExtract.translatedText,
          wikiUrl:
            data?.content_urls?.desktop?.page ||
            `https://en.wikipedia.org/wiki/${encodeURIComponent(enSlug)}`,
          thumbnailUrl: data?.thumbnail?.source || null,
        };
      }
    }
  } catch {
    // ignore
  }

  return { summaryTr: null, wikiUrl: null, thumbnailUrl: null };
}

async function fetchWikidataPopulation(nameEn: string): Promise<number | null> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=${encodeURIComponent(
      nameEn
    )}&props=claims&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "AgoraMundi/1.0" },
      signal: AbortSignal.timeout(3500),
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
        Boolean(country.summaryTr);

      if (isFresh) return;

      const meta = getWorldCountryMetaByCode(code);
      const nameEn = country.nameEn || meta?.nameEn || country.nameTr;
      const currencyCode = country.currencyCode || meta?.currencyCode || null;

      const [wiki, population, rates] = await Promise.all([
        country.summaryTr
          ? Promise.resolve({
              summaryTr: country.summaryTr,
              wikiUrl: country.wikiUrl,
              thumbnailUrl: country.thumbnailUrl,
            })
          : fetchWikipediaSummary(code, country.nameTr, nameEn),
        country.population
          ? Promise.resolve(country.population)
          : fetchWikidataPopulation(nameEn),
        getUsdExchangeRates(),
      ]);

      let usdRate: number | null = country.usdRate;
      let tryRate: number | null = country.tryRate;

      if (rates && currencyCode && rates[currencyCode]) {
        usdRate = rates[currencyCode]; // 1 USD = X local currency
        if (rates.TRY && usdRate > 0) {
          // 1 unit of local currency = (TRY per USD) / (Local per USD) TRY
          tryRate = Number((rates.TRY / usdRate).toFixed(4));
        }
      }

      await prisma.country.update({
        where: { code },
        data: {
          summaryTr: wiki.summaryTr ?? country.summaryTr,
          wikiUrl: wiki.wikiUrl ?? country.wikiUrl,
          thumbnailUrl: wiki.thumbnailUrl ?? country.thumbnailUrl,
          population: population ?? country.population,
          usdRate,
          tryRate,
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
