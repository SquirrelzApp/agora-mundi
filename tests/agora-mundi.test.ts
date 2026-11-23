import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCountryGoogleNewsQuery,
  cleanHeadlineAndPublisher,
  clusterNewsIntoDistinctTopics,
  parseRssXmlItems,
  inferAgendaCategory,
  type VerifiedNewsSource,
} from "../src/lib/news-intelligence";
import {
  hashPassword,
  verifyPassword,
  normalizeUsername,
} from "../src/lib/auth";
import {
  validateStructuralRules,
  moderateComment,
} from "../src/lib/ai-moderator";
import { getAllWorldCountries } from "../src/lib/world-countries";
import { getSchedulerStatusSnapshot } from "../src/lib/news-scheduler";
import { resolveDistinctClusterMatches } from "../src/lib/ai-agenda-curator";
import { checkRateLimit, verifyCronSecretToken } from "../src/lib/request-guard";
import {
  countryCodeToLanguage,
  normalizeLanguageCode,
} from "../src/lib/language-config";
import {
  detectVisitorLocale,
  isPrivateOrLocalIp,
  parseAcceptLanguage,
} from "../src/lib/geo-language";

describe("World Countries Catalog (English)", () => {
  it("loads ~174 world countries in English with capitals, currencies, and coordinates", () => {
    const countries = getAllWorldCountries();
    assert.ok(
      countries.length >= 170,
      `Expected >=170 countries, got ${countries.length}`
    );

    const tr = countries.find((c) => c.code === "TR");
    assert.ok(tr, "TR must exist");
    assert.equal(tr.name, "Turkey");
    assert.equal(tr.capital, "Ankara");
    assert.equal(tr.currencyCode, "TRY");
    assert.equal(tr.region, "Eurasia & Middle East");
    assert.equal(tr.updateIntervalHours, 1, "HOT countries refresh every 1h");
    assert.ok(tr.areaKm2 && tr.areaKm2 > 700000);

    const jp = countries.find((c) => c.code === "JP");
    assert.ok(jp, "JP must exist");
    assert.equal(jp.name, "Japan");
    assert.equal(jp.currencyCode, "JPY");
    assert.equal(jp.region, "Asia-Pacific");
    assert.equal(
      jp.updateIntervalHours,
      3,
      "MODERATE countries refresh every 3h"
    );

    const sched = getSchedulerStatusSnapshot();
    assert.equal(sched.tickIntervalMinutes, 10);
    assert.deepEqual(sched.tiersHours, { HOT: 1, MODERATE: 3, STABLE: 6 });
  });
});

describe("News Intelligence & Jaccard Topic Clustering", () => {
  it("always enforces recency window even on overridden country queries", () => {
    const usQ = buildCountryGoogleNewsQuery("US", "United States", "3d");
    const trQ = buildCountryGoogleNewsQuery("TR", "Turkey", "7d");
    assert.ok(usQ.endsWith("when:3d"), `US query missing when:3d: ${usQ}`);
    assert.ok(trQ.endsWith("when:7d"), `TR query missing when:7d: ${trQ}`);
  });

  it("extracts clean title and publisher from RSS title suffixes", () => {
    const res = cleanHeadlineAndPublisher(
      "Central Bank announces interest rate decision - Reuters"
    );
    assert.equal(
      res.cleanTitle,
      "Central Bank announces interest rate decision"
    );
    assert.equal(res.publisher, "Reuters");
  });

  it("parses valid RSS XML items, filters trivial gossip/sports noise, and drops stale articles beyond maxAgeDays", () => {
    const freshDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toUTCString();
    const staleDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toUTCString();
    const sampleXml = `
      <rss><channel>
        <item>
          <title>Central Bank announces major inflation reform package - Reuters</title>
          <link>https://www.reuters.com/world/economy-1</link>
          <pubDate>${freshDate}</pubDate>
          <source url="https://www.reuters.com">Reuters</source>
        </item>
        <item>
          <title>Supreme Court issued historic ruling two months ago - BBC</title>
          <link>https://www.bbc.com/news/old-story</link>
          <pubDate>${staleDate}</pubDate>
          <source url="https://www.bbc.com">BBC</source>
        </item>
        <item>
          <title>Champions League match highlights and transfer rumors - SportTV</title>
          <link>https://example.com/sports</link>
          <pubDate>${freshDate}</pubDate>
        </item>
      </channel></rss>
    `;
    const items = parseRssXmlItems(sampleXml, 7);
    assert.equal(items.length, 1);
    assert.equal(items[0].publisher, "Reuters");
    assert.equal(inferAgendaCategory(items[0].title), "ECONOMY");
  });

  it("clusters duplicate coverage of the same event into a single topic and keeps 3 distinct agendas", () => {
    const now = new Date().toISOString();
    const rawItems: VerifiedNewsSource[] = [
      {
        title:
          "Parliament approves new national defense budget amid border tensions",
        publisher: "Reuters",
        url: "https://reuters.com/1",
        publishedAt: now,
        lang: "en",
      },
      {
        title:
          "National defense budget approved by Parliament amid rising border tensions",
        publisher: "Bloomberg",
        url: "https://bloomberg.com/1",
        publishedAt: now,
        lang: "en",
      },
      {
        title:
          "Central Bank holds interest rates steady as inflation slows in October",
        publisher: "Financial Times",
        url: "https://ft.com/2",
        publishedAt: now,
        lang: "en",
      },
      {
        title:
          "High-speed semiconductor factory opens in southern industrial zone",
        publisher: "BBC News",
        url: "https://bbc.com/3",
        publishedAt: now,
        lang: "en",
      },
    ];

    const clusters = clusterNewsIntoDistinctTopics(rawItems);
    assert.equal(
      clusters.length,
      3,
      "4 articles with 2 duplicates must produce 3 distinct clusters"
    );
    assert.equal(
      clusters[0].sources.length,
      2,
      "Merged cluster must retain both Reuters & Bloomberg sources"
    );
  });
});

describe("Authentication & Moderation Rules", () => {
  it("hashes and verifies passwords securely with scrypt", async () => {
    const hash = await hashPassword("StrongPass2026!");
    assert.ok(hash.includes(":"));
    assert.equal(await verifyPassword("StrongPass2026!", hash), true);
    assert.equal(await verifyPassword("WrongPass", hash), false);
  });

  it("normalizes usernames cleanly", () => {
    assert.equal(normalizeUsername("John_Doe!"), "john_doe");
  });

  it("allows 10+ character normal comments and blocks <10 chars or media links", () => {
    const shortRes = validateStructuralRules("Too short");
    assert.ok(shortRes && !shortRes.approved);
    assert.equal(shortRes.violationCategory, "CHAR_LIMIT");

    const okRes = validateStructuralRules("That is a very thoughtful analysis!");
    assert.equal(okRes, null);

    const mediaRes = validateStructuralRules(
      "Look at this photo https://site.com/photo.jpg"
    );
    assert.ok(mediaRes && !mediaRes.approved);
    assert.equal(mediaRes.violationCategory, "MEDIA_FORBIDDEN");
  });

  it("approves conversational nested replies and blocks profanity in moderateComment", async () => {
    const replyRes = await moderateComment(
      "United States",
      "Federal Reserve signals cautious path on interest rate cuts",
      "I completely agree, this is a very reasonable assessment.",
      undefined,
      {
        isReply: true,
        parentExcerpt: "Inflation expectations in the next quarter will be key.",
      }
    );
    assert.equal(replyRes.approved, true);
    assert.equal(replyRes.violationCategory, "NONE");

    const profanityRes = await moderateComment(
      "United States",
      "Federal Reserve signals cautious path on interest rate cuts",
      "What a fucking stupid bullshit policy decision this is"
    );
    assert.equal(profanityRes.approved, false);
    assert.equal(profanityRes.violationCategory, "PROFANITY");
  });
});

describe("Production Hardening: Deduplication, Categories & Request Guards", () => {
  it("deduplicates repeated or out-of-bounds Gemini clusterIndex values", () => {
    const clusters = ["c0", "c1", "c2", "c3"];
    const matched = resolveDistinctClusterMatches([1, 1, 99], clusters);
    assert.deepEqual(matched, ["c1", "c0", "c2"]);
  });

  it("classifies cyberattacks, labor strikes/tariffs, and diplomatic visits accurately", () => {
    assert.equal(
      inferAgendaCategory("Major cyberattack disrupts Icelandic web hosting services"),
      "TECHNOLOGY"
    );
    assert.equal(
      inferAgendaCategory("German metalworkers union calls for 24-hour labor strike over wages"),
      "ECONOMY"
    );
    assert.equal(
      inferAgendaCategory("Nepal Prime Minister visits India to strengthen bilateral relations"),
      "DIPLOMACY"
    );
  });

  it("enforces sliding-window rate limits accurately", () => {
    const key = `test-rl-${Date.now()}`;
    assert.equal(checkRateLimit(key, 2, 60_000).allowed, true);
    assert.equal(checkRateLimit(key, 2, 60_000).allowed, true);
    const blocked = checkRateLimit(key, 2, 60_000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSec >= 1);
  });

  it("verifies CRON_SECRET in constant time and fails closed in production when unset", () => {
    assert.equal(verifyCronSecretToken(null, undefined, true).ok, false);
    assert.equal(verifyCronSecretToken(null, undefined, true).status, 503);
    assert.equal(verifyCronSecretToken(null, undefined, false).ok, true);
    assert.equal(verifyCronSecretToken("wrong", "supersecret", true).ok, false);
    assert.equal(verifyCronSecretToken("supersecret", "supersecret", true).ok, true);
  });
});

describe("IP Region Detection & Language Localization", () => {
  it("normalizes BCP-47 language codes and maps world countries accurately", () => {
    assert.equal(normalizeLanguageCode("tr-TR"), "tr");
    assert.equal(normalizeLanguageCode("zh_Hant_TW"), "zh-TW");
    assert.equal(normalizeLanguageCode("zh-CN"), "zh-CN");
    assert.equal(normalizeLanguageCode("iw"), "he");
    assert.equal(normalizeLanguageCode("invalid!!!"), "en");

    assert.equal(countryCodeToLanguage("TR"), "tr");
    assert.equal(countryCodeToLanguage("DE"), "de");
    assert.equal(countryCodeToLanguage("JP"), "ja");
    assert.equal(countryCodeToLanguage("BR"), "pt");
    assert.equal(countryCodeToLanguage("CA", ["fr", "en"]), "fr");
    assert.equal(countryCodeToLanguage("CH", ["it", "en"]), "it");
  });

  it("identifies private/local IPs and resolves geo headers or Accept-Language", async () => {
    assert.equal(isPrivateOrLocalIp("127.0.0.1"), true);
    assert.equal(isPrivateOrLocalIp("192.168.1.25"), true);
    assert.equal(isPrivateOrLocalIp("::1"), true);
    assert.equal(isPrivateOrLocalIp("8.8.8.8"), false);

    assert.deepEqual(
      parseAcceptLanguage("tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7"),
      ["tr", "en"]
    );

    const vercelTrHeaders = new Headers({
      "x-vercel-ip-country": "TR",
      "accept-language": "en-US,en;q=0.9",
    });
    const trRes = await detectVisitorLocale(vercelTrHeaders);
    assert.equal(trRes.lang, "tr");
    assert.equal(trRes.countryCode, "TR");
    assert.equal(trRes.source, "geo-header");

    const cfDeHeaders = new Headers({
      "cf-ipcountry": "DE",
    });
    const deRes = await detectVisitorLocale(cfDeHeaders);
    assert.equal(deRes.lang, "de");
    assert.equal(deRes.countryCode, "DE");

    const localFallbackHeaders = new Headers({
      "x-forwarded-for": "127.0.0.1",
      "accept-language": "fr-FR,fr;q=0.9",
    });
    const localRes = await detectVisitorLocale(localFallbackHeaders);
    assert.equal(localRes.lang, "fr");
    assert.equal(localRes.source, "accept-language");
  });
});
