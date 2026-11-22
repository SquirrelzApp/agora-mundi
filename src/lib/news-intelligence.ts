/**
 * Real-Time Multi-Source English News Intelligence & Topic Clustering Engine
 * - Google News RSS (US English + UK/International English editions)
 * - Bing News RSS (Zero-key English fallback source)
 * - GNews API (Optional extra English verification layer when GNEWS_API_KEY is set)
 * - Jaccard & Containment Topic Clustering: merges duplicate coverage of the same event
 *   and extracts the top 3 completely distinct real-world agendas (A, B, C) with verified sources.
 */

export interface VerifiedNewsSource {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  lang: "en";
}

export interface NewsTopicCluster {
  primaryTitle: string;
  primaryLang: "en";
  categoryHint: string;
  publishedAt: string;
  score: number;
  sources: VerifiedNewsSource[];
}

// Disambiguate country names that collide with US states, people, or common nouns
const COUNTRY_QUERY_OVERRIDES: Record<string, { enQuery: string }> = {
  TR: {
    enQuery:
      '"Turkey" OR "Türkiye" (Ankara OR Erdogan OR economy OR parliament OR foreign policy) -thanksgiving -recipe -roast',
  },
  US: {
    enQuery:
      '"United States" (White House OR Congress OR Senate OR economy OR Supreme Court OR foreign policy) -sports -NFL -NBA',
  },
  GB: {
    enQuery:
      '"United Kingdom" OR "Britain" (Parliament OR Downing Street OR economy OR Starmer OR Bank of England) -Premier League',
  },
  GE: {
    enQuery:
      '"Georgia" (Tbilisi OR parliament OR Kobakhidze OR Caucasus OR EU) -Atlanta -Bulldogs -NFL -NCAA',
  },
  JO: {
    enQuery:
      '"Jordan" (Amman OR King Abdullah OR Middle East OR government OR economy) -NBA -Bulls -sneakers -Michael',
  },
  ML: {
    enQuery: '"Mali" (Bamako OR Sahel OR junta OR government OR economy)',
  },
  TD: {
    enQuery: '"Chad" (N\'Djamena OR Deby OR Sahel OR government OR oil)',
  },
  NE: {
    enQuery: '"Niger" (Niamey OR Sahel OR ECOWAS OR uranium OR junta)',
  },
  XK_NCY: {
    enQuery: '"Northern Cyprus" OR "TRNC" (Nicosia OR Cyprus talks OR economy)',
  },
  XK: {
    enQuery: '"Kosovo" (Pristina OR Kurti OR Balkans OR EU OR Serbia)',
  },
  PS: {
    enQuery:
      '"Palestine" OR "Gaza" OR "West Bank" (ceasefire OR humanitarian OR diplomacy)',
  },
  AZ: {
    enQuery: '"Azerbaijan" (Baku OR Karabakh OR energy OR diplomacy OR economy)',
  },
  OM: {
    enQuery: '"Oman" (Muscat OR Gulf OR energy OR diplomacy OR economy)',
  },
  CY: {
    enQuery: '"Cyprus" (Nicosia OR EU OR Mediterranean OR energy OR economy)',
  },
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "over",
  "after",
  "amid",
  "into",
  "says",
  "said",
  "will",
  "new",
  "more",
  "its",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "how",
  "why",
  "what",
  "who",
  "about",
  "news",
  "live",
  "updates",
  "update",
  "report",
  "reports",
  "breaking",
  "latest",
  "today",
  "year",
  "years",
  "could",
  "would",
  "should",
]);

const TRIVIAL_GOSSIP_SPORTS_REGEX =
  /\b(horoscope|astrology|premier league|champions league|la liga|serie a|bundesliga|nba playoffs|nfl draft|super bowl|match highlights|watch live|starting xi|transfer rumors|celebrity|kardashian|tiktok trend|lottery results|weather forecast|box office)\b/i;

export function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .trim();
}

export function cleanHeadlineAndPublisher(
  rawTitle: string,
  fallbackPublisher = "International Press"
): { cleanTitle: string; publisher: string } {
  const decoded = decodeXmlEntities(rawTitle).replace(/\s+/g, " ").trim();
  // Google/Bing RSS titles frequently end with " - Publisher Name" or " | Publisher"
  const dashIdx = decoded.lastIndexOf(" - ");
  if (dashIdx > 18 && decoded.length - dashIdx < 48) {
    return {
      cleanTitle: decoded.slice(0, dashIdx).trim(),
      publisher: decoded.slice(dashIdx + 3).trim() || fallbackPublisher,
    };
  }
  const pipeIdx = decoded.lastIndexOf(" | ");
  if (pipeIdx > 18 && decoded.length - pipeIdx < 48) {
    return {
      cleanTitle: decoded.slice(0, pipeIdx).trim(),
      publisher: decoded.slice(pipeIdx + 3).trim() || fallbackPublisher,
    };
  }
  return { cleanTitle: decoded, publisher: fallbackPublisher };
}

export function parseRssXmlItems(
  xml: string,
  maxAgeDays = 7
): VerifiedNewsSource[] {
  const results: VerifiedNewsSource[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  const nowMs = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const maxFutureMs = 24 * 60 * 60 * 1000;

  for (const match of itemMatches) {
    const block = match[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

    if (!titleMatch || !linkMatch) continue;

    const explicitSource = sourceMatch
      ? decodeXmlEntities(sourceMatch[1])
      : undefined;
    const { cleanTitle, publisher } = cleanHeadlineAndPublisher(
      titleMatch[1],
      explicitSource || "Global Press"
    );

    if (cleanTitle.length < 18) continue;
    if (TRIVIAL_GOSSIP_SPORTS_REGEX.test(cleanTitle)) continue;

    const url = decodeXmlEntities(linkMatch[1]);
    if (!url.startsWith("http")) continue;

    let publishedIso = new Date(nowMs).toISOString();
    if (pubDateMatch) {
      const parsedDate = new Date(decodeXmlEntities(pubDateMatch[1]));
      const ts = parsedDate.getTime();
      if (!Number.isNaN(ts)) {
        // Hard freshness gate: drop stale archival articles or bogus future dates
        if (nowMs - ts > maxAgeMs || ts - nowMs > maxFutureMs) {
          continue;
        }
        publishedIso = parsedDate.toISOString();
      }
    }

    results.push({
      title: cleanTitle,
      publisher,
      url,
      publishedAt: publishedIso,
      lang: "en",
    });
  }

  return results;
}

export function extractSignificantTokens(
  text: string,
  countryTokensToIgnore: string[] = []
): string[] {
  const ignore = new Set([
    ...STOPWORDS,
    ...countryTokensToIgnore.map((t) => t.toLowerCase()),
  ]);
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !ignore.has(w));
}

export function inferAgendaCategory(text: string): string {
  const lower = text.toLowerCase();
  if (
    /\b(inflation|economy|economic|gdp|bank|interest rate|tax|budget|trade|tariff|currency|debt|market|energy|oil|gas|exports|recession|imf|central bank|housing|wages)\b/i.test(
      lower
    )
  ) {
    return "ECONOMY";
  }
  if (
    /\b(military|war|army|missile|attack|defense|defence|security|border|troops|ceasefire|police|conflict|terror|strike|airstrike|insurgent|navy)\b/i.test(
      lower
    )
  ) {
    return "SECURITY";
  }
  if (
    /\b(summit|diplomacy|diplomatic|treaty|ambassador|foreign minister|nato|un|eu|sanctions|bilateral|alliance|talks|negotiation|accord|embassy)\b/i.test(
      lower
    )
  ) {
    return "DIPLOMACY";
  }
  if (
    /\b(ai|artificial intelligence|tech|chip|semiconductor|cyber|space|satellite|digital|telecom|quantum|data center|startup)\b/i.test(
      lower
    )
  ) {
    return "TECHNOLOGY";
  }
  if (
    /\b(earthquake|flood|wildfire|climate|volcano|storm|drought|environment|emission|hurricane|typhoon|carbon|renewable|glacier)\b/i.test(
      lower
    )
  ) {
    return "ENVIRONMENT";
  }
  if (
    /\b(election|parliament|president|prime minister|coalition|vote|voting|court|law|reform|opposition|protest|government|senate|congress|cabinet|minister|constitution)\b/i.test(
      lower
    )
  ) {
    return "POLITICS";
  }
  return "SOCIETY";
}

export function clusterNewsIntoDistinctTopics(
  items: VerifiedNewsSource[],
  countryIgnoreWords: string[] = []
): NewsTopicCluster[] {
  interface InternalCluster {
    tokens: Set<string>;
    items: VerifiedNewsSource[];
  }

  const clusters: InternalCluster[] = [];

  for (const item of items) {
    const itemTokens = extractSignificantTokens(item.title, countryIgnoreWords);
    if (itemTokens.length === 0) continue;

    let matchedCluster: InternalCluster | null = null;
    let bestSimilarity = 0;

    for (const cluster of clusters) {
      let overlap = 0;
      for (const tok of itemTokens) {
        if (cluster.tokens.has(tok)) overlap++;
      }
      const minSize = Math.max(
        1,
        Math.min(itemTokens.length, cluster.tokens.size)
      );
      const unionSize = new Set([...itemTokens, ...cluster.tokens]).size;
      const containment = overlap / minSize;
      const jaccard = overlap / Math.max(1, unionSize);

      const score = Math.max(containment * 0.85, jaccard * 1.35);
      if ((overlap >= 2 && containment >= 0.34) || jaccard >= 0.26) {
        if (score > bestSimilarity) {
          bestSimilarity = score;
          matchedCluster = cluster;
        }
      }
    }

    if (matchedCluster) {
      const alreadyHasPublisher = matchedCluster.items.some(
        (existing) =>
          existing.url === item.url ||
          (existing.publisher === item.publisher &&
            existing.title.toLowerCase() === item.title.toLowerCase())
      );
      if (!alreadyHasPublisher) {
        matchedCluster.items.push(item);
        for (const t of itemTokens.slice(0, 6)) {
          matchedCluster.tokens.add(t);
        }
      }
    } else {
      clusters.push({
        tokens: new Set(itemTokens),
        items: [item],
      });
    }
  }

  const nowMs = Date.now();

  const scoredClusters: NewsTopicCluster[] = clusters.map((c) => {
    // Sort items newest-first so primaryTitle & sources always highlight the freshest coverage
    const sortedItems = [...c.items].sort(
      (a, b) =>
        (new Date(b.publishedAt).getTime() || 0) -
        (new Date(a.publishedAt).getTime() || 0)
    );
    const preferred =
      sortedItems.find((i) => i.title.length >= 25) || sortedItems[0];

    const newestMs = Math.max(
      ...sortedItems.map((i) => new Date(i.publishedAt).getTime() || 0)
    );
    const ageHours = Math.max(0, (nowMs - newestMs) / (1000 * 60 * 60));
    // Strong recency priority: breaking news from last 24-48h clearly outranks older clusters
    const recencyBonus = Math.max(0, 20 - ageHours * 0.25);
    const multiSourceBonus = Math.min(4, sortedItems.length) * 2.5;

    // Deduplicate publishers in displayed sources (up to 3)
    const uniqueSources: VerifiedNewsSource[] = [];
    const seenPubs = new Set<string>();
    for (const src of sortedItems) {
      const key = src.publisher.toLowerCase();
      if (!seenPubs.has(key)) {
        seenPubs.add(key);
        uniqueSources.push(src);
      }
      if (uniqueSources.length >= 3) break;
    }
    if (uniqueSources.length === 0) uniqueSources.push(sortedItems[0]);

    return {
      primaryTitle: preferred.title,
      primaryLang: "en",
      categoryHint: inferAgendaCategory(
        sortedItems.map((x) => x.title).join(" ")
      ),
      publishedAt: new Date(newestMs || nowMs).toISOString(),
      score: multiSourceBonus + recencyBonus,
      sources: uniqueSources,
    };
  });

  scoredClusters.sort((a, b) => b.score - a.score);
  return scoredClusters;
}

async function fetchTextFast(url: string, timeoutMs = 4500): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept:
        "application/rss+xml, application/xml, text/xml, application/json, */*",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
}

export function buildCountryGoogleNewsQuery(
  countryCode: string,
  countryName: string,
  whenWindow: "3d" | "7d" | "21d" = "3d"
): string {
  const code = countryCode.toUpperCase();
  const override = COUNTRY_QUERY_OVERRIDES[code];
  const baseQuery =
    override?.enQuery ||
    `"${countryName}" (government OR economy OR parliament OR minister OR president OR policy OR crisis)`;
  // Always enforce the recency window even for override queries
  return `${baseQuery} when:${whenWindow}`;
}

export async function fetchCountryLiveNewsClusters(
  countryCode: string,
  countryName: string
): Promise<NewsTopicCluster[]> {
  const freshQuery3d = buildCountryGoogleNewsQuery(
    countryCode,
    countryName,
    "3d"
  );

  const primaryFeeds: Array<{ url: string; maxAgeDays: number }> = [
    {
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(
        freshQuery3d
      )}&hl=en-US&gl=US&ceid=US:en`,
      maxAgeDays: 4,
    },
    {
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(
        freshQuery3d
      )}&hl=en-GB&gl=GB&ceid=GB:en`,
      maxAgeDays: 4,
    },
    {
      url: `https://www.bing.com/news/search?q=${encodeURIComponent(
        `${countryName} news`
      )}&format=rss&setlang=en-US&qft=interval%3d%227%22`,
      maxAgeDays: 7,
    },
  ];

  const settled = await Promise.allSettled(
    primaryFeeds.map(async (feed) => {
      const xml = await fetchTextFast(feed.url, 4500);
      return parseRssXmlItems(xml, feed.maxAgeDays);
    })
  );

  let allItems: VerifiedNewsSource[] = [];
  for (const res of settled) {
    if (res.status === "fulfilled") {
      allItems.push(...res.value);
    }
  }

  // Optional GNews API enrichment if GNEWS_API_KEY is set
  const gnewsKey = process.env.GNEWS_API_KEY;
  if (gnewsKey) {
    try {
      const fromIso = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const gUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent(
        countryName
      )}&lang=en&from=${encodeURIComponent(fromIso)}&max=6&apikey=${encodeURIComponent(
        gnewsKey
      )}`;
      const rawJson = await fetchTextFast(gUrl, 3500);
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed?.articles)) {
        for (const art of parsed.articles) {
          if (art?.title && art?.url) {
            allItems.push({
              title: String(art.title),
              publisher: String(art.source?.name || "GNews"),
              url: String(art.url),
              publishedAt: art.publishedAt || new Date().toISOString(),
              lang: "en",
            });
          }
        }
      }
    } catch {
      // Non-fatal optional layer
    }
  }

  // Stage 2: 7-day fallback if 3-day feeds returned fewer than 6 items
  if (allItems.length < 6) {
    try {
      const query7d = buildCountryGoogleNewsQuery(
        countryCode,
        countryName,
        "7d"
      );
      const xml7d = await fetchTextFast(
        `https://news.google.com/rss/search?q=${encodeURIComponent(
          query7d
        )}&hl=en-US&gl=US&ceid=US:en`,
        4500
      );
      allItems = [...allItems, ...parseRssXmlItems(xml7d, 7)];
    } catch {
      // ignore
    }
  }

  // Stage 3: Broader 21-day fallback ONLY for smaller nations with sparse 7-day coverage
  if (allItems.length < 4) {
    try {
      const broadQuery = `"${countryName}" when:21d`;
      const broadXml = await fetchTextFast(
        `https://news.google.com/rss/search?q=${encodeURIComponent(
          broadQuery
        )}&hl=en-US&gl=US&ceid=US:en`,
        4500
      );
      allItems = [...allItems, ...parseRssXmlItems(broadXml, 21)];
    } catch {
      // ignore
    }
  }

  const ignoreWords = countryName.split(/\s+/);

  return clusterNewsIntoDistinctTopics(allItems, ignoreWords);
}
