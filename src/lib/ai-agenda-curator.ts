import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";
import {
  fetchCountryLiveNewsClusters,
  extractSignificantTokens,
  inferAgendaCategory,
  NewsTopicCluster,
  VerifiedNewsSource,
} from "@/lib/news-intelligence";
import { getWorldCountryMetaByCode } from "@/lib/world-countries";

export interface CuratedAgendaSlot {
  slot: "A" | "B" | "C";
  title: string;
  summary: string;
  category: string;
  publishedAt: string;
  sourceOrigin: "GEMINI_GROUNDED" | "LIVE_RSS_CURATED";
  sources: Array<{
    title: string;
    publisher: string;
    url: string;
    publishedAt: string;
  }>;
}

const SLOTS: Array<"A" | "B" | "C"> = ["A", "B", "C"];

const AGENDA_CATEGORIES = [
  "POLITICS",
  "ECONOMY",
  "SECURITY",
  "DIPLOMACY",
  "SOCIETY",
  "TECHNOLOGY",
  "ENVIRONMENT",
] as const;

const VALID_CATEGORY_SET = new Set<string>(AGENDA_CATEGORIES);

function getNewsGeminiApiKey(): string | undefined {
  return (
    process.env.GEMINI_NEWS_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY
  );
}

function getNewsGeminiModel(): string {
  return process.env.GEMINI_NEWS_MODEL || "gemini-3.5-flash-lite";
}

function polishHeadline(raw: string): string {
  const cleaned = raw
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "")
    .trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normalizeCategory(raw: string | undefined, fallbackText: string): string {
  const upper = (raw || "").trim().toUpperCase();
  if (VALID_CATEGORY_SET.has(upper)) return upper;
  return inferAgendaCategory(fallbackText);
}

/**
 * Formats each cluster for Gemini with concrete date + up to 2 real headlines + publishers.
 * Intentionally omits regex categoryHint so Gemini classifies accurately from meaning alone.
 */
function formatClusterLineForPrompt(c: NewsTopicCluster, idx: number): string {
  const dateStr = c.publishedAt.slice(0, 10);
  const altSource = c.sources.find(
    (s) => s.title.toLowerCase() !== c.primaryTitle.toLowerCase()
  );
  const pubList = c.sources
    .map((s) => s.publisher)
    .slice(0, 3)
    .join(", ");
  const altPart = altSource ? ` | Also: "${altSource.title}"` : "";
  return `  [${idx}] (${dateStr}) "${c.primaryTitle}"${altPart} — Sources: ${pubList}`;
}

const EDITORIAL_CATEGORY_GUIDE = `Category definitions (choose the single best fit):
- POLITICS: elections, parliament, courts, legislation, cabinet, domestic political disputes
- ECONOMY: trade, tariffs, inflation, central banks, GDP, budgets, labor/union strikes, energy markets
- SECURITY: war, military, defense, police, borders, counterterrorism, armed conflict
- DIPLOMACY: bilateral/multilateral visits, summits, treaties, foreign policy, UN/EU/NATO, sanctions
- TECHNOLOGY: AI, semiconductors, cyberattacks/cybersecurity, space, telecom, digital policy
- ENVIRONMENT: climate summits (COP), storms, earthquakes, floods, wildfires, energy transition, emissions
- SOCIETY: public health, education, migration, culture, accidents/disasters, civic life`;

/**
 * Guarantees valid, bounds-checked, non-duplicate cluster assignments across slots A/B/C.
 */
export function resolveDistinctClusterMatches<T>(
  requestedIndices: number[],
  clusters: T[]
): Array<T | undefined> {
  if (clusters.length === 0) {
    return requestedIndices.map(() => undefined);
  }
  const used = new Set<number>();
  return requestedIndices.map((rawIdx, pos) => {
    const candidate =
      Number.isInteger(rawIdx) && rawIdx >= 0 && rawIdx < clusters.length
        ? rawIdx
        : pos < clusters.length
        ? pos
        : 0;

    if (!used.has(candidate)) {
      used.add(candidate);
      return clusters[candidate];
    }

    // Pick the highest-priority unused cluster to avoid duplicating the same story
    for (let i = 0; i < clusters.length; i++) {
      if (!used.has(i)) {
        used.add(i);
        return clusters[i];
      }
    }

    return clusters[candidate];
  });
}

function isRetryableGeminiError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : 0;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  return /429|500|502|503|504|rate limit|resource_exhausted|overloaded|timeout|econnreset|fetch failed|unavailable/i.test(
    msg
  );
}

async function callGeminiWithRetry<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  maxAttempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Gemini request timeout after ${timeoutMs}ms`)),
            timeoutMs
          );
        }),
      ]);
      if (timer) clearTimeout(timer);
      return result;
    } catch (err) {
      if (timer) clearTimeout(timer);
      lastErr = err;
      if (attempt < maxAttempts && isRetryableGeminiError(err)) {
        const delayMs = attempt * 1500 + Math.floor(Math.random() * 500);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Live English News Clusters + Gemini 3.5 Flash-Lite (if configured) / Zero-Key Live RSS Curator.
 * Zero fabricated/hardcoded templates; 100% grounded in live English news sources.
 */
export async function curateLiveCountryAgendas(
  countryCode: string,
  countryName: string
): Promise<CuratedAgendaSlot[]> {
  const clusters: NewsTopicCluster[] = await fetchCountryLiveNewsClusters(
    countryCode,
    countryName
  );

  const apiKey = getNewsGeminiApiKey();

  // 1. Gemini 3.5 Flash-Lite Grounded Synthesis (when API key is configured)
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const topClusters = clusters.slice(0, 8);
      const clusterDigest = topClusters
        .map((c, idx) => formatClusterLineForPrompt(c, idx))
        .join("\n");

      const useSearchTool =
        topClusters.length === 0 &&
        process.env.GEMINI_ENABLE_PAID_SEARCH === "true";
      const modelName = getNewsGeminiModel();

      const interaction = await callGeminiWithRetry(
        () =>
          ai.interactions.create({
            model: modelName,
            generation_config: {
              thinking_level: "low",
            },
            ...(useSearchTool ? { tools: [{ type: "google_search" }] } : {}),
            system_instruction: `You are the chief editor of globeTake, a global civic discourse platform.
Your task: Based strictly on the provided live news clusters, produce the 3 most important, COMPLETELY DISTINCT current agendas (A, B, C) for this country in crisp, neutral English.
Rules:
1. NEVER fabricate facts; stay strictly faithful to the provided live news clusters.
2. ALWAYS prioritize the most recent breaking developments (latest dates first).
3. Each "title" must be a concrete, specific, clickbait-free English headline (45-115 characters) naming the actual people, institutions, policies, or events from the cluster. NEVER write vague generic headlines like "Political debate ensues" or "Leaders hold discussions".
4. Each "summary" must be a concrete 1-2 sentence neutral background brief grounded in the cluster.
5. Each of the 3 items MUST reference a DIFFERENT "clusterIndex" (0-${Math.max(0, topClusters.length - 1)}).
6. ${EDITORIAL_CATEGORY_GUIDE}`,
            input: `Country: ${countryName} (${countryCode})\nLive News Clusters:\n${
              clusterDigest ||
              "Very few clusters available; use Google Search to identify today's 3 most important real-world stories for this country in English."
            }`,
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        summary: { type: "string" },
                        category: {
                          type: "string",
                          enum: [...AGENDA_CATEGORIES],
                        },
                        clusterIndex: { type: "integer" },
                      },
                      required: ["title", "summary", "category", "clusterIndex"],
                    },
                  },
                },
                required: ["items"],
              },
            },
          }),
        25_000,
        3
      );

      if (interaction.output_text) {
        const parsed = JSON.parse(interaction.output_text) as {
          items?: Array<{
            title: string;
            summary: string;
            category: string;
            clusterIndex: number;
          }>;
        };

        if (Array.isArray(parsed.items) && parsed.items.length === 3) {
          const matchedClusters = resolveDistinctClusterMatches(
            parsed.items.map((it) => it.clusterIndex),
            topClusters
          );

          return parsed.items.map((item, idx) => {
            const matchedCluster = matchedClusters[idx];
            const cleanTitle = polishHeadline(item.title);
            const sources = matchedCluster
              ? matchedCluster.sources.map((s) => ({
                  title: s.title,
                  publisher: s.publisher,
                  url: s.url,
                  publishedAt: s.publishedAt,
                }))
              : [];

            return {
              slot: SLOTS[idx],
              title: cleanTitle,
              summary: item.summary.trim(),
              category: normalizeCategory(item.category, cleanTitle),
              publishedAt:
                matchedCluster?.publishedAt || new Date().toISOString(),
              sourceOrigin: "GEMINI_GROUNDED",
              sources,
            };
          });
        }
      }
    } catch (err) {
      console.warn(
        `[ai-agenda-curator] Gemini fallback to live RSS curator for ${countryCode}:`,
        err
      );
    }
  }

  // 2. Zero-Key Real-Time English RSS Curator (no translation needed)
  const selectedClusters = clusters.slice(0, 3);

  return selectedClusters.map((cluster, idx): CuratedAgendaSlot => {
    const cleanTitle = polishHeadline(cluster.primaryTitle);
    const pubNames = cluster.sources.map((s) => s.publisher).join(", ");
    let summary = "";

    if (cluster.sources.length > 1) {
      const secondSource: VerifiedNewsSource = cluster.sources[1];
      summary = `Reported across ${pubNames}. Related coverage also highlights "${polishHeadline(
        secondSource.title
      )}".`;
    } else if (cluster.sources[0]) {
      summary = `Developing story reported by ${cluster.sources[0].publisher} attracting public attention in ${countryName}.`;
    }

    return {
      slot: SLOTS[idx],
      title: cleanTitle,
      summary,
      category: cluster.categoryHint || inferAgendaCategory(cleanTitle),
      publishedAt: cluster.publishedAt,
      sourceOrigin: "LIVE_RSS_CURATED",
      sources: cluster.sources.map((s) => ({
        title: s.title,
        publisher: s.publisher,
        url: s.url,
        publishedAt: s.publishedAt,
      })),
    };
  });
}

// Deduplicate concurrent sync calls for the same country
const inFlightSyncMap = new Map<string, Promise<boolean>>();

function topicsAreSameStory(titleA: string, titleB: string): boolean {
  const tokA = extractSignificantTokens(titleA);
  const tokB = extractSignificantTokens(titleB);
  if (tokA.length === 0 || tokB.length === 0) return false;
  const setB = new Set(tokB);
  let overlap = 0;
  for (const t of tokA) {
    if (setB.has(t)) overlap++;
  }
  const minLen = Math.min(tokA.length, tokB.length);
  return overlap >= 2 && overlap / minLen >= 0.4;
}

async function persistCuratedSlotsForCountry(
  code: string,
  existingAgendas: Array<{ id: string; title: string }>,
  curatedSlots: CuratedAgendaSlot[]
): Promise<boolean> {
  if (curatedSlots.length === 0) return false;

  // Preserve existing active AgendaItems (and their comments!) if the topic is still ongoing
  const usedExistingIds = new Set<string>();
  const matchedExistingBySlot = new Map<string, string>();

  for (const incoming of curatedSlots) {
    const match = existingAgendas.find(
      (ex) =>
        !usedExistingIds.has(ex.id) &&
        topicsAreSameStory(ex.title, incoming.title)
    );
    if (match) {
      usedExistingIds.add(match.id);
      matchedExistingBySlot.set(incoming.slot, match.id);
    }
  }

  // Archive superseded active agendas (comments remain preserved in archive!)
  for (const oldAgenda of existingAgendas) {
    if (!usedExistingIds.has(oldAgenda.id)) {
      await prisma.agendaItem.update({
        where: { id: oldAgenda.id },
        data: { isActive: false, archivedAt: new Date() },
      });
    }
  }

  // Update continuing agendas or create fresh slots
  for (const incoming of curatedSlots) {
    const existingId = matchedExistingBySlot.get(incoming.slot);
    const sourcesJson = JSON.stringify(incoming.sources);
    const publishedDate = incoming.publishedAt
      ? new Date(incoming.publishedAt)
      : new Date();

    if (existingId) {
      await prisma.agendaItem.update({
        where: { id: existingId },
        data: {
          slot: incoming.slot,
          title: incoming.title,
          summary: incoming.summary,
          category: incoming.category,
          sourcesJson,
          sourceOrigin: incoming.sourceOrigin,
          publishedAt: publishedDate,
          isActive: true,
        },
      });
    } else {
      await prisma.agendaItem.create({
        data: {
          countryCode: code,
          slot: incoming.slot,
          title: incoming.title,
          summary: incoming.summary,
          category: incoming.category,
          sourcesJson,
          sourceOrigin: incoming.sourceOrigin,
          publishedAt: publishedDate,
          isActive: true,
        },
      });
    }
  }

  const now = new Date();
  await prisma.country.update({
    where: { code },
    data: {
      lastSyncedAt: now,
      lastUpdatedAt: now,
    },
  });

  return true;
}

export async function syncCountryAgendasToDb(
  countryCode: string,
  force = false
): Promise<boolean> {
  const code = countryCode.toUpperCase();
  const existingPromise = inFlightSyncMap.get(code);
  if (existingPromise) {
    return existingPromise;
  }

  const syncTask = (async (): Promise<boolean> => {
    try {
      const country = await prisma.country.findUnique({
        where: { code },
        include: {
          agendas: {
            where: { isActive: true },
            orderBy: { slot: "asc" },
          },
        },
      });

      if (!country) return false;

      if (!force && country.lastSyncedAt && country.agendas.length > 0) {
        const ageHours =
          (Date.now() - country.lastSyncedAt.getTime()) / (1000 * 60 * 60);
        if (ageHours < country.updateIntervalHours) {
          return true;
        }
      }

      const meta = getWorldCountryMetaByCode(code);
      const name = country.name || meta?.name || code;

      const curatedSlots = await curateLiveCountryAgendas(code, name);

      return await persistCuratedSlotsForCountry(
        code,
        country.agendas,
        curatedSlots
      );
    } catch (error) {
      console.error(`[syncCountryAgendasToDb] Failed for ${code}:`, error);
      return false;
    } finally {
      inFlightSyncMap.delete(code);
    }
  })();

  inFlightSyncMap.set(code, syncTask);
  return syncTask;
}

/**
 * Background Batch News Fetching + Gemini 3.5 Curation Engine:
 * Live English RSS clusters are curated in a single batched Gemini 3.5 call into
 * 3 distinct English agendas (A, B, C) and written directly to PostgreSQL so
 * user clicks on the site NEVER wait on Gemini.
 */
export async function syncBatchCountriesToDb(
  countryCodes: string[],
  force = false
): Promise<number> {
  const normalizedCodes = Array.from(
    new Set(countryCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))
  ).filter((c) => !inFlightSyncMap.has(c));

  if (normalizedCodes.length === 0) return 0;

  let resolver!: (val: boolean) => void;
  const sharedGate = new Promise<boolean>((r) => {
    resolver = r;
  });
  for (const c of normalizedCodes) {
    inFlightSyncMap.set(c, sharedGate);
  }

  let syncedCount = 0;
  try {
    const dbCountries = await prisma.country.findMany({
      where: { code: { in: normalizedCodes } },
      include: {
        agendas: {
          where: { isActive: true },
          orderBy: { slot: "asc" },
        },
      },
    });

    const eligible = dbCountries.filter((country) => {
      if (force || !country.lastSyncedAt || country.agendas.length === 0) {
        return true;
      }
      const ageHours =
        (Date.now() - country.lastSyncedAt.getTime()) / (1000 * 60 * 60);
      return ageHours >= country.updateIntervalHours;
    });

    if (eligible.length === 0) {
      resolver(true);
      return 0;
    }

    // 1. Fetch live English RSS clusters in parallel for all countries in this batch
    const rawClusterResults = await Promise.all(
      eligible.map(async (country) => {
        const meta = getWorldCountryMetaByCode(country.code);
        const name = country.name || meta?.name || country.code;
        const clusters = await fetchCountryLiveNewsClusters(country.code, name);
        return { country, name, clusters };
      })
    );

    // Zero-Token Change Detection: if free RSS headlines match existing DB agendas,
    // bump lastSyncedAt and skip calling Gemini completely (0 tokens spent!).
    const clusterResults: typeof rawClusterResults = [];
    for (const item of rawClusterResults) {
      if (
        !force &&
        item.country.agendas.length === 3 &&
        item.clusters.length >= 3
      ) {
        const existingUrls = new Set<string>();
        const existingRawTitles: string[] = [];
        for (const ag of item.country.agendas) {
          try {
            const parsedSrc = JSON.parse(ag.sourcesJson || "[]") as Array<{
              url?: string;
              title?: string;
            }>;
            for (const s of parsedSrc) {
              if (s.url) existingUrls.add(s.url);
              if (s.title) existingRawTitles.push(s.title);
            }
          } catch {
            // ignore
          }
        }

        const top3 = item.clusters.slice(0, 3);
        const unchangedCount = top3.filter((cl) =>
          cl.sources.some(
            (s) =>
              existingUrls.has(s.url) ||
              existingRawTitles.some((t) => topicsAreSameStory(t, s.title))
          )
        ).length;

        if (unchangedCount === 3) {
          await prisma.country.update({
            where: { code: item.country.code },
            data: { lastSyncedAt: new Date() },
          });
          continue;
        }
      }
      clusterResults.push(item);
    }

    if (clusterResults.length === 0) {
      resolver(true);
      return 0;
    }

    const richEntries = clusterResults.filter((e) => e.clusters.length >= 1);
    const sparseEntries = clusterResults.filter((e) => e.clusters.length === 0);
    const handledCodes = new Set<string>();

    const apiKey = getNewsGeminiApiKey();

    // 2. Single batched Gemini 3.5 call for all countries with rich RSS clusters
    if (apiKey && richEntries.length > 0) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const modelName = getNewsGeminiModel();

        const batchPrompt = richEntries
          .map(({ country, name, clusters }) => {
            const top = clusters.slice(0, 7);
            const lines = top
              .map((c, idx) => formatClusterLineForPrompt(c, idx))
              .join("\n");
            return `=== COUNTRY: ${country.code} | ${name} ===\n${lines}`;
          })
          .join("\n\n");

        const interaction = await callGeminiWithRetry(
          () =>
            ai.interactions.create({
              model: modelName,
              generation_config: {
                thinking_level: "low",
              },
              system_instruction: `You are the chief editor of globeTake, a global civic discourse platform.
For each country provided, use its live news clusters to prepare the 3 most important, COMPLETELY DISTINCT real-world agendas (items: exactly 3 elements) in crisp, neutral English.
Rules:
1. NEVER fabricate facts; stay strictly faithful to the provided live news clusters.
2. ALWAYS prioritize the most recent breaking developments (latest dates first).
3. Each "title" must be concrete and specific (45-115 characters), naming real people, institutions, countries, laws, or events from the cluster. NEVER write vague placeholders like "Leaders hold discussions", "Political debate ensues", or "Administration reports developments".
4. Each "summary" must be a concrete 1-2 sentence neutral background brief grounded in the cluster.
5. Each of the 3 items for a country MUST reference a DIFFERENT "clusterIndex" (0-6).
6. ${EDITORIAL_CATEGORY_GUIDE}`,
              input: batchPrompt,
              response_format: {
                type: "text",
                mime_type: "application/json",
                schema: {
                  type: "object",
                  properties: {
                    countries: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          code: { type: "string" },
                          items: {
                            type: "array",
                            minItems: 3,
                            maxItems: 3,
                            items: {
                              type: "object",
                              properties: {
                                title: { type: "string" },
                                summary: { type: "string" },
                                category: {
                                  type: "string",
                                  enum: [...AGENDA_CATEGORIES],
                                },
                                clusterIndex: { type: "integer" },
                              },
                              required: [
                                "title",
                                "summary",
                                "category",
                                "clusterIndex",
                              ],
                            },
                          },
                        },
                        required: ["code", "items"],
                      },
                    },
                  },
                  required: ["countries"],
                },
              },
            }),
          45_000,
          3
        );

        if (interaction.output_text) {
          const parsed = JSON.parse(interaction.output_text) as {
            countries?: Array<{
              code: string;
              items: Array<{
                title: string;
                summary: string;
                category: string;
                clusterIndex: number;
              }>;
            }>;
          };

          if (Array.isArray(parsed.countries)) {
            for (const entry of richEntries) {
              const found = parsed.countries.find(
                (c) => c.code?.toUpperCase() === entry.country.code
              );
              if (
                found &&
                Array.isArray(found.items) &&
                found.items.length === 3
              ) {
                const top = entry.clusters.slice(0, 7);
                const matchedClusters = resolveDistinctClusterMatches(
                  found.items.map((it) => it.clusterIndex),
                  top
                );

                const slots: CuratedAgendaSlot[] = found.items.map(
                  (item, idx) => {
                    const matched = matchedClusters[idx];
                    const cleanTitle = polishHeadline(item.title);
                    return {
                      slot: SLOTS[idx],
                      title: cleanTitle,
                      summary: item.summary.trim(),
                      category: normalizeCategory(item.category, cleanTitle),
                      publishedAt:
                        matched?.publishedAt || new Date().toISOString(),
                      sourceOrigin: "GEMINI_GROUNDED",
                      sources: matched
                        ? matched.sources.map((s) => ({
                            title: s.title,
                            publisher: s.publisher,
                            url: s.url,
                            publishedAt: s.publishedAt,
                          }))
                        : [],
                    };
                  }
                );

                const ok = await persistCuratedSlotsForCountry(
                  entry.country.code,
                  entry.country.agendas,
                  slots
                );
                if (ok) {
                  handledCodes.add(entry.country.code);
                  syncedCount++;
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("[syncBatchCountriesToDb] Batch Gemini fallback:", err);
      }
    }

    // 3. Fallback for sparse-RSS countries or any entry missed in the batch call
    const remaining = [
      ...sparseEntries,
      ...richEntries.filter((e) => !handledCodes.has(e.country.code)),
    ];

    for (const entry of remaining) {
      const slots = await curateLiveCountryAgendas(
        entry.country.code,
        entry.name
      );
      const ok = await persistCuratedSlotsForCountry(
        entry.country.code,
        entry.country.agendas,
        slots
      );
      if (ok) syncedCount++;
    }

    resolver(true);
    return syncedCount;
  } catch (err) {
    console.error("[syncBatchCountriesToDb] Error:", err);
    resolver(false);
    return syncedCount;
  } finally {
    for (const c of normalizedCodes) {
      inFlightSyncMap.delete(c);
    }
  }
}
