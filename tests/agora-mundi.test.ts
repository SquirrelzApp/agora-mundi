import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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

describe("World Countries Catalog", () => {
  it("loads ~174 world countries with capitals, currencies, and coordinates", () => {
    const countries = getAllWorldCountries();
    assert.ok(countries.length >= 170, `Expected >=170 countries, got ${countries.length}`);

    const tr = countries.find((c) => c.code === "TR");
    assert.ok(tr, "TR must exist");
    assert.equal(tr.capital, "Ankara");
    assert.equal(tr.currencyCode, "TRY");
    assert.equal(tr.updateIntervalHours, 1, "HOT countries refresh every 1h");
    assert.ok(tr.areaKm2 && tr.areaKm2 > 700000);

    const jp = countries.find((c) => c.code === "JP");
    assert.ok(jp, "JP must exist");
    assert.equal(jp.currencyCode, "JPY");
    assert.equal(jp.updateIntervalHours, 3, "MODERATE countries refresh every 3h");

    const sched = getSchedulerStatusSnapshot();
    assert.equal(sched.tickIntervalMinutes, 10);
    assert.deepEqual(sched.tiersHours, { HOT: 1, MODERATE: 3, STABLE: 6 });
  });
});

describe("News Intelligence & Jaccard Topic Clustering", () => {
  it("extracts clean title and publisher from RSS title suffixes", () => {
    const res = cleanHeadlineAndPublisher(
      "Merkez Bankası faiz kararını açıkladı - Anadolu Ajansı"
    );
    assert.equal(res.cleanTitle, "Merkez Bankası faiz kararını açıkladı");
    assert.equal(res.publisher, "Anadolu Ajansı");
  });

  it("parses valid RSS XML items and filters trivial gossip/sports noise", () => {
    const sampleXml = `
      <rss><channel>
        <item>
          <title>Central Bank announces major inflation reform package - Reuters</title>
          <link>https://www.reuters.com/world/economy-1</link>
          <pubDate>Sat, 14 Nov 2026 09:00:00 GMT</pubDate>
          <source url="https://www.reuters.com">Reuters</source>
        </item>
        <item>
          <title>Champions League live match transfer haberleri - SporX</title>
          <link>https://example.com/sports</link>
          <pubDate>Sat, 14 Nov 2026 09:05:00 GMT</pubDate>
        </item>
      </channel></rss>
    `;
    const items = parseRssXmlItems(sampleXml, "en");
    assert.equal(items.length, 1);
    assert.equal(items[0].publisher, "Reuters");
    assert.equal(inferAgendaCategory(items[0].title), "EKONOMİ");
  });

  it("clusters duplicate coverage of the same event into a single topic and keeps 3 distinct agendas", () => {
    const now = new Date().toISOString();
    const rawItems: VerifiedNewsSource[] = [
      {
        title: "Parliament approves new national defense budget amid border tensions",
        publisher: "Reuters",
        url: "https://reuters.com/1",
        publishedAt: now,
        lang: "en",
      },
      {
        title: "National defense budget approved by Parliament amid rising border tensions",
        publisher: "Bloomberg",
        url: "https://bloomberg.com/1",
        publishedAt: now,
        lang: "en",
      },
      {
        title: "Central Bank holds interest rates steady as inflation slows in October",
        publisher: "Financial Times",
        url: "https://ft.com/2",
        publishedAt: now,
        lang: "en",
      },
      {
        title: "High-speed semiconductor factory opens in southern industrial zone",
        publisher: "BBC News",
        url: "https://bbc.com/3",
        publishedAt: now,
        lang: "en",
      },
    ];

    const clusters = clusterNewsIntoDistinctTopics(rawItems);
    assert.equal(clusters.length, 3, "4 articles with 2 duplicates must produce 3 distinct clusters");
    assert.equal(clusters[0].sources.length, 2, "Merged cluster must retain both Reuters & Bloomberg sources");
  });
});

describe("Authentication & Moderation Rules", () => {
  it("hashes and verifies passwords securely with scrypt", async () => {
    const hash = await hashPassword("GucluSifre2026!");
    assert.ok(hash.includes(":"));
    assert.equal(await verifyPassword("GucluSifre2026!", hash), true);
    assert.equal(await verifyPassword("YanlisSifre", hash), false);
  });

  it("normalizes Turkish characters in usernames cleanly", () => {
    assert.equal(normalizeUsername("Çağrı_Öztürk!"), "cagri_ozturk");
  });

  it("allows 10+ character normal comments and blocks <10 chars or media links", () => {
    const shortRes = validateStructuralRules("Çok kısa");
    assert.ok(shortRes && !shortRes.approved);
    assert.equal(shortRes.violationCategory, "CHAR_LIMIT");

    const okRes = validateStructuralRules("Çok yerinde bir değerlendirme!");
    assert.equal(okRes, null);

    const mediaRes = validateStructuralRules(
      "Şu görsele bakın https://site.com/foto.jpg"
    );
    assert.ok(mediaRes && !mediaRes.approved);
    assert.equal(mediaRes.violationCategory, "MEDIA_FORBIDDEN");
  });

  it("approves conversational nested replies and blocks profanity in moderateComment", async () => {
    const replyRes = await moderateComment(
      "Türkiye",
      "Merkez Bankası enflasyon raporu ve para politikası adımları",
      "Kesinlikle katılıyorum, bu değerlendirme çok yerinde olmuş.",
      undefined,
      {
        isReply: true,
        parentExcerpt: "Enflasyon beklentilerinde önümüzdeki çeyrek kritik olacak.",
      }
    );
    assert.equal(replyRes.approved, true);
    assert.equal(replyRes.violationCategory, "NONE");

    const profanityRes = await moderateComment(
      "Türkiye",
      "Merkez Bankası enflasyon raporu",
      "Böyle saçma sapan siktir git karar mı olur"
    );
    assert.equal(profanityRes.approved, false);
    assert.equal(profanityRes.violationCategory, "PROFANITY");
  });
});
