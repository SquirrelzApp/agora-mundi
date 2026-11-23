import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";
import { translateWithGoogle } from "@/lib/google-translate";
import { getLanguageOption, normalizeLanguageCode } from "@/lib/language-config";
import { checkRateLimit } from "@/lib/request-guard";

export interface TranslatableAgenda {
  id: string;
  title: string;
  summary: string;
}

export interface TranslatedAgendaText {
  title: string;
  summary: string;
}

const globalForTranslator = globalThis as unknown as {
  __agoraTranslationInFlight?: Map<string, Promise<TranslatedAgendaText | null>>;
  __agoraGeminiCooldownUntil?: number;
};

function getInFlightMap(): Map<string, Promise<TranslatedAgendaText | null>> {
  if (!globalForTranslator.__agoraTranslationInFlight) {
    globalForTranslator.__agoraTranslationInFlight = new Map();
  }
  return globalForTranslator.__agoraTranslationInFlight;
}

function getTranslationGeminiKey(): string | undefined {
  return (
    process.env.GEMINI_TRANSLATION_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_NEWS_API_KEY ||
    process.env.GOOGLE_API_KEY
  );
}

function getTranslationGeminiModel(): string {
  return (
    process.env.GEMINI_TRANSLATION_MODEL ||
    process.env.GEMINI_NEWS_MODEL ||
    "gemini-3.5-flash-lite"
  );
}

async function translateBatchWithModel(
  items: TranslatableAgenda[],
  targetLang: string
): Promise<Map<string, TranslatedAgendaText>> {
  const results = new Map<string, TranslatedAgendaText>();
  const apiKey = getTranslationGeminiKey();
  if (!apiKey || items.length === 0) return results;

  const cooldownUntil = globalForTranslator.__agoraGeminiCooldownUntil || 0;
  if (Date.now() < cooldownUntil) return results;

  const langMeta = getLanguageOption(targetLang);
  const ai = new GoogleGenAI({ apiKey });
  const modelName = getTranslationGeminiModel();

  const payload = items.map((item) => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
  }));

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const interaction = await Promise.race([
      ai.interactions.create({
        model: modelName,
        generation_config: {
          thinking_level: "low",
        },
        system_instruction: `You are a professional newsroom translator for an international current-affairs platform.
Translate each agenda item's "title" and "summary" from English into ${langMeta.englishName} (${targetLang}).
Rules:
1. Preserve exact factual meaning, proper nouns, institutions, numbers, and neutral journalistic tone.
2. Make headlines natural, crisp, and idiomatic in ${langMeta.englishName}.
3. Return every item with its exact matching "id". If "summary" is empty, return "".`,
        input: JSON.stringify({ items: payload }),
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    summary: { type: "string" },
                  },
                  required: ["id", "title", "summary"],
                },
              },
            },
            required: ["items"],
          },
        },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Agenda translation model timeout")),
          7500
        );
      }),
    ]);

    if (interaction.output_text) {
      const parsed = JSON.parse(interaction.output_text) as {
        items?: Array<{ id: string; title: string; summary: string }>;
      };
      if (Array.isArray(parsed.items)) {
        const validIds = new Set(items.map((i) => i.id));
        for (const entry of parsed.items) {
          if (
            entry &&
            validIds.has(entry.id) &&
            typeof entry.title === "string" &&
            entry.title.trim().length > 0
          ) {
            results.set(entry.id, {
              title: entry.title.trim(),
              summary:
                typeof entry.summary === "string" ? entry.summary.trim() : "",
            });
          }
        }
      }
    }
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err).toLowerCase();
    if (/429|resource_exhausted|quota|rate limit/i.test(msg)) {
      // Back off model calls briefly if free-tier quota is hit, falling back immediately to machine translate
      globalForTranslator.__agoraGeminiCooldownUntil = Date.now() + 60_000;
    }
    console.warn("[agenda-translator] Model translation fallback:", err);
  } finally {
    if (timer) clearTimeout(timer);
  }

  return results;
}

async function translateBatchWithGoogleFallback(
  items: TranslatableAgenda[],
  targetLang: string
): Promise<Map<string, TranslatedAgendaText>> {
  const results = new Map<string, TranslatedAgendaText>();
  const CONCURRENCY = 4;

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const slice = items.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (item) => {
        const [titleRes, summaryRes] = await Promise.all([
          translateWithGoogle(item.title, targetLang),
          item.summary.trim()
            ? translateWithGoogle(item.summary, targetLang)
            : Promise.resolve({
                translatedText: "",
                detectedSourceLang: "auto",
                ok: true,
              }),
        ]);

        if (titleRes.ok && (!item.summary.trim() || summaryRes.ok)) {
          results.set(item.id, {
            title: titleRes.translatedText,
            summary: summaryRes.translatedText,
          });
        }
      })
    );
  }

  return results;
}

/**
 * Pure database lookup for already-cached agenda translations.
 * Never triggers external API calls (ideal for 174-country catalog hover previews).
 */
export async function getCachedAgendaTranslations(
  agendaIds: string[],
  rawTargetLang: string
): Promise<Map<string, TranslatedAgendaText>> {
  const resultMap = new Map<string, TranslatedAgendaText>();
  const targetLang = normalizeLanguageCode(rawTargetLang);
  if (targetLang === "en" || agendaIds.length === 0) {
    return resultMap;
  }

  const rows = await prisma.agendaTranslation.findMany({
    where: {
      agendaItemId: { in: agendaIds },
      languageCode: targetLang,
    },
    select: {
      agendaItemId: true,
      title: true,
      summary: true,
    },
  });

  for (const row of rows) {
    resultMap.set(row.agendaItemId, {
      title: row.title,
      summary: row.summary,
    });
  }

  return resultMap;
}

/**
 * On-demand translation with PostgreSQL persistence & in-flight deduplication:
 * - If language is "en", returns originals immediately.
 * - Reads cached translations from AgendaTranslation table first.
 * - Only translates missing items, stores them in DB so every subsequent user
 *   with the same language gets the exact same cached translation at 0 cost.
 */
export async function ensureAgendaTranslations(
  agendas: TranslatableAgenda[],
  rawTargetLang: string,
  options?: { allowTranslate?: boolean; rateLimitKey?: string }
): Promise<Map<string, TranslatedAgendaText>> {
  const targetLang = normalizeLanguageCode(rawTargetLang);
  const resultMap = new Map<string, TranslatedAgendaText>();

  if (agendas.length === 0) return resultMap;

  if (targetLang === "en") {
    for (const ag of agendas) {
      resultMap.set(ag.id, { title: ag.title, summary: ag.summary });
    }
    return resultMap;
  }

  // 1. Read existing DB cache
  const cachedMap = await getCachedAgendaTranslations(
    agendas.map((a) => a.id),
    targetLang
  );

  const missing: TranslatableAgenda[] = [];
  for (const ag of agendas) {
    const cached = cachedMap.get(ag.id);
    if (cached) {
      resultMap.set(ag.id, cached);
    } else {
      missing.push(ag);
    }
  }

  let canTranslate = options?.allowTranslate !== false;
  if (canTranslate && missing.length > 0 && options?.rateLimitKey) {
    const rl = checkRateLimit(options.rateLimitKey, 35, 60_000);
    canTranslate = rl.allowed;
  }

  if (missing.length === 0 || !canTranslate) {
    for (const ag of missing) {
      resultMap.set(ag.id, { title: ag.title, summary: ag.summary });
    }
    return resultMap;
  }

  // 2. Deduplicate concurrent requests for the same (agendaId, targetLang)
  const inFlight = getInFlightMap();
  const waiters: Array<{
    item: TranslatableAgenda;
    promise: Promise<TranslatedAgendaText | null>;
  }> = [];
  const toTranslate: TranslatableAgenda[] = [];
  const resolvers = new Map<string, (val: TranslatedAgendaText | null) => void>();

  for (const item of missing) {
    const key = `${item.id}:${targetLang}`;
    const existingPromise = inFlight.get(key);
    if (existingPromise) {
      waiters.push({ item, promise: existingPromise });
    } else {
      let resFn!: (val: TranslatedAgendaText | null) => void;
      const p = new Promise<TranslatedAgendaText | null>((resolve) => {
        resFn = resolve;
      });
      inFlight.set(key, p);
      resolvers.set(item.id, resFn);
      toTranslate.push(item);
      waiters.push({ item, promise: p });
    }
  }

  if (toTranslate.length > 0) {
    (async () => {
      const translatedBatch = new Map<string, TranslatedAgendaText>();
      try {
        // Translate in batches of up to 12
        for (let i = 0; i < toTranslate.length; i += 12) {
          const chunk = toTranslate.slice(i, i + 12);
          const modelTranslations = await translateBatchWithModel(
            chunk,
            targetLang
          );
          for (const [id, val] of modelTranslations.entries()) {
            translatedBatch.set(id, val);
          }

          const stillMissing = chunk.filter((c) => !translatedBatch.has(c.id));
          if (stillMissing.length > 0) {
            const fallbackTranslations = await translateBatchWithGoogleFallback(
              stillMissing,
              targetLang
            );
            for (const [id, val] of fallbackTranslations.entries()) {
              translatedBatch.set(id, val);
            }
          }
        }

        // Persist newly translated entries to DB (skipDuplicates handles cross-instance races)
        const rowsToSave = Array.from(translatedBatch.entries()).map(
          ([agendaItemId, tr]) => ({
            agendaItemId,
            languageCode: targetLang,
            title: tr.title,
            summary: tr.summary,
          })
        );

        if (rowsToSave.length > 0) {
          await prisma.agendaTranslation.createMany({
            data: rowsToSave,
            skipDuplicates: true,
          });
        }
      } catch (err) {
        console.error("[agenda-translator] Translation persistence error:", err);
      } finally {
        for (const item of toTranslate) {
          const key = `${item.id}:${targetLang}`;
          inFlight.delete(key);
          const resolve = resolvers.get(item.id);
          if (resolve) {
            resolve(translatedBatch.get(item.id) || null);
          }
        }
      }
    })();
  }

  // 3. Await all missing items (both our batch and any concurrent waiters)
  await Promise.all(
    waiters.map(async ({ item, promise }) => {
      const translated = await promise;
      resultMap.set(
        item.id,
        translated || { title: item.title, summary: item.summary }
      );
    })
  );

  return resultMap;
}
