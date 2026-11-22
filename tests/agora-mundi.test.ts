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
