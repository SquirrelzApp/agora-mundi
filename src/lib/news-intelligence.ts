/**
 * Gerçek Zamanlı Çoklu Kaynak Haber İstihbarat ve Konu Kümeleme Motoru
 * - Google News RSS (Ülke yerel edisyonu + Türkçe basın + Küresel İngilizce basın)
 * - Bing News RSS (Sıfır anahtarlı yedek kaynak)
 * - GNews API (GNEWS_API_KEY tanımlıysa ek doğrulama katmanı)
 * - Jaccard Konu Kümeleme: Aynı olayı anlatan haberleri birleştirip birbirinden tamamen
 *   farklı en önemli 3 gerçek gündemi (A, B, C) kaynak linkleriyle birlikte çıkarır.
 */

export interface VerifiedNewsSource {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  lang: "tr" | "en" | "other";
}

export interface NewsTopicCluster {
  primaryTitle: string;
  primaryLang: "tr" | "en" | "other";
  categoryHint: string;
  publishedAt: string;
  score: number;
  sources: VerifiedNewsSource[];
}

// Disambiguate country names that collide with US states, people, or common nouns
const COUNTRY_QUERY_OVERRIDES: Record<
  string,
  { enQuery: string; trQuery?: string; edition?: { hl: string; gl: string; ceid: string } }
> = {
  TR: {
    enQuery: '"Turkey" OR "Türkiye" (Ankara OR Erdogan OR economy OR parliament)',
    trQuery: 'Türkiye (ekonomi OR meclis OR hükümet OR gündem OR bakanlık) -spor -futbol -maç',
    edition: { hl: "tr", gl: "TR", ceid: "TR:tr" },
  },
  US: {
    enQuery: '"United States" (White House OR Congress OR Senate OR economy OR Supreme Court) -sports',
    trQuery: 'ABD (Kongre OR Beyaz Saray OR ekonomi OR seçim OR dış politika)',
    edition: { hl: "en-US", gl: "US", ceid: "US:en" },
  },
  GE: {
    enQuery: '"Georgia" (Tbilisi OR parliament OR Kobakhidze OR Caucasus) -Atlanta -Bulldogs -NFL',
    trQuery: 'Gürcistan (Tiflis OR parlamento OR siyaset OR ekonomi)',
  },
  JO: {
    enQuery: '"Jordan" (Amman OR King Abdullah OR Middle East OR government) -NBA -Bulls -sneakers',
    trQuery: 'Ürdün (Amman OR ekonomi OR siyaset OR Orta Doğu)',
  },
  ML: {
    enQuery: '"Mali" (Bamako OR Sahel OR junta OR government)',
    trQuery: 'Mali (Bamako OR Afrika OR yönetim)',
  },
  TD: {
    enQuery: '"Chad" (N\'Djamena OR Deby OR Sahel OR government)',
    trQuery: 'Çad (Afrika OR hükümet OR ekonomi)',
  },
  NE: {
    enQuery: '"Niger" (Niamey OR Sahel OR ECOWAS OR uranium)',
    trQuery: 'Nijer (Niamey OR Afrika OR uranyum)',
  },
  XK_NCY: {
    enQuery: '"Northern Cyprus" OR "TRNC" (Nicosia OR Cyprus talks OR economy)',
    trQuery: '"KKTC" OR "Kuzey Kıbrıs" (Lefkoşa OR meclis OR ekonomi OR Kıbrıs)',
  },
  XK: {
    enQuery: '"Kosovo" (Pristina OR Kurti OR Balkans OR EU)',
    trQuery: 'Kosova (Priştine OR Balkanlar OR siyaset)',
  },
  PS: {
    enQuery: '"Palestine" OR "Gaza" OR "West Bank" (ceasefire OR humanitarian OR diplomacy)',
    trQuery: 'Filistin OR Gazze (ateşkes OR diplomasi OR Batı Şeria)',
  },
  AZ: {
    enQuery: '"Azerbaijan" (Baku OR Karabakh OR energy OR diplomacy)',
    trQuery: 'Azerbaycan (Bakü OR enerji OR diplomasi OR ekonomi) -maç',
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
  "has",
  "have",
  "how",
  "why",
  "what",
  "who",
  "about",
  "news",
  "live",
  "updates",
  "report",
  "reports",
  "bir",
  "ve",
  "için",
  "ile",
  "olan",
  "olarak",
  "sonra",
  "yeni",
  "daha",
  "göre",
  "karşı",
  "üzerine",
  "ilgili",
  "son",
  "dakika",
  "haberi",
  "haberleri",
]);

const TRIVIAL_GOSSIP_SPORTS_REGEX =
  /\b(horoscope|burç|astroloji|premier league|champions league|şampiyonlar ligi|süper lig|transfer haberleri|maç özeti|canlı izle|ilk 11|celebrity|kardashian|tiktok trend|lottery|piyango sonuçları|hava durumu tahmini)\b/i;

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
  fallbackPublisher = "Uluslararası Basın"
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
  lang: "tr" | "en" | "other"
): VerifiedNewsSource[] {
  const results: VerifiedNewsSource[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);

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
      explicitSource || (lang === "tr" ? "Haber Kaynağı" : "Global Press")
    );

    if (cleanTitle.length < 18) continue;
    if (TRIVIAL_GOSSIP_SPORTS_REGEX.test(cleanTitle)) continue;

    const url = decodeXmlEntities(linkMatch[1]);
    if (!url.startsWith("http")) continue;

    let publishedIso = new Date().toISOString();
    if (pubDateMatch) {
      const parsedDate = new Date(decodeXmlEntities(pubDateMatch[1]));
      if (!Number.isNaN(parsedDate.getTime())) {
        publishedIso = parsedDate.toISOString();
      }
    }

    results.push({
      title: cleanTitle,
      publisher,
      url,
      publishedAt: publishedIso,
      lang,
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
    /\b(inflation|economy|economic|gdp|bank|interest rate|tax|budget|trade|tariff|currency|debt|market|energy|oil|gas|enflasyon|ekonomi|merkez bankası|faiz|bütçe|vergi|ticaret|ihracat|kriz|enerji|petrol|doğalgaz|maaş|konut)\b/i.test(
      lower
    )
  ) {
    return "EKONOMİ";
  }
  if (
    /\b(military|war|army|missile|attack|defense|security|border|troops|ceasefire|police|conflict|terror|askeri|savaş|ordu|savunma|güvenlik|sınır|çatışma|ateşkes|operasyon|saldırı)\b/i.test(
      lower
    )
  ) {
    return "GÜVENLİK";
  }
  if (
    /\b(summit|diplomacy|treaty|ambassador|foreign minister|nato|un|eu|sanctions|bilateral|alliance|diplomasi|zirve|dışişleri|yaptırım|anlaşma|müzakere|ab|bm)\b/i.test(
      lower
    )
  ) {
    return "DİPLOMASİ";
  }
  if (
    /\b(ai|artificial intelligence|tech|chip|semiconductor|cyber|space|satellite|digital|yapay zeka|teknoloji|çip|siber|uzay|dijital)\b/i.test(
      lower
    )
  ) {
    return "TEKNOLOJİ";
  }
  if (
    /\b(earthquake|flood|wildfire|climate|volcano|storm|drought|environment|emission|deprem|sel|yangın|iklim|volkan|fırtına|kuraklık|çevre)\b/i.test(
      lower
    )
  ) {
    return "ÇEVRE";
  }
  if (
    /\b(election|parliament|president|prime minister|coalition|vote|court|law|reform|opposition|protest|government|seçim|meclis|parlamento|hükümet|cumhurbaşkanı|başbakan|koalisyon|yasa|mahkeme|muhalefet|protesto|grev)\b/i.test(
      lower
    )
  ) {
    return "SİYASET";
  }
  return "TOPLUM";
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
      const minSize = Math.max(1, Math.min(itemTokens.length, cluster.tokens.size));
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
      // Avoid duplicate URL or identical publisher+title
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
    // Prefer Turkish headline if cluster contains a high-quality Turkish item, else the first item
    const preferred =
      c.items.find((i) => i.lang === "tr" && i.title.length >= 25) || c.items[0];

    const newestMs = Math.max(
      ...c.items.map((i) => new Date(i.publishedAt).getTime() || 0)
    );
    const ageHours = Math.max(0, (nowMs - newestMs) / (1000 * 60 * 60));
    const recencyBonus = Math.max(0, 12 - Math.min(12, ageHours / 8));
    const multiSourceBonus = Math.min(4, c.items.length) * 3.2;

    // Deduplicate publishers in displayed sources (up to 3)
    const uniqueSources: VerifiedNewsSource[] = [];
    const seenPubs = new Set<string>();
    for (const src of c.items) {
      const key = src.publisher.toLowerCase();
      if (!seenPubs.has(key)) {
        seenPubs.add(key);
        uniqueSources.push(src);
      }
      if (uniqueSources.length >= 3) break;
    }
    if (uniqueSources.length === 0) uniqueSources.push(c.items[0]);

    return {
      primaryTitle: preferred.title,
      primaryLang: preferred.lang,
      categoryHint: inferAgendaCategory(
        c.items.map((x) => x.title).join(" ")
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
      Accept: "application/rss+xml, application/xml, text/xml, application/json, */*",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
}

export async function fetchCountryLiveNewsClusters(
  countryCode: string,
  countryNameTr: string,
  countryNameEn: string
): Promise<NewsTopicCluster[]> {
  const code = countryCode.toUpperCase();
  const override = COUNTRY_QUERY_OVERRIDES[code];

  const trQuery =
    override?.trQuery || `"${countryNameTr}" when:14d`;
  const enRecentQuery =
    override?.enQuery ||
    `"${countryNameEn}" (government OR economy OR parliament OR minister OR president OR policy OR crisis) when:7d`;
  const enBroadQuery = `"${countryNameEn}" when:30d`;

  const urlsToFetch: Array<{ url: string; lang: "tr" | "en" }> = [
    {
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(
        enRecentQuery
      )}&hl=en-US&gl=US&ceid=US:en`,
      lang: "en",
    },
    {
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(
        trQuery
      )}&hl=tr&gl=TR&ceid=TR:tr`,
      lang: "tr",
    },
    {
      url: `https://www.bing.com/news/search?q=${encodeURIComponent(
        countryNameEn
      )}&format=rss`,
      lang: "en",
    },
  ];

  if (code === "TR") {
    urlsToFetch.unshift({
      url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FuQjBHZ0pVVWlnQVAB?hl=tr&gl=TR&ceid=TR:tr",
      lang: "tr",
    });
  }

  const settled = await Promise.allSettled(
    urlsToFetch.map(async (entry) => {
      const xml = await fetchTextFast(entry.url, 4500);
      return parseRssXmlItems(xml, entry.lang);
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
      const gUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent(
        countryNameEn
      )}&max=6&apikey=${encodeURIComponent(gnewsKey)}`;
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

  // For smaller nations with sparse 7-day news, run a broader 30-day fallback immediately
  if (allItems.length < 6) {
    try {
      const broadXml = await fetchTextFast(
        `https://news.google.com/rss/search?q=${encodeURIComponent(
          enBroadQuery
        )}&hl=en-US&gl=US&ceid=US:en`,
        4500
      );
      allItems = [...allItems, ...parseRssXmlItems(broadXml, "en")];
    } catch {
      // ignore
    }
  }

  const ignoreWords = [
    ...countryNameEn.split(/\s+/),
    ...countryNameTr.split(/\s+/),
  ];

  return clusterNewsIntoDistinctTopics(allItems, ignoreWords);
}
