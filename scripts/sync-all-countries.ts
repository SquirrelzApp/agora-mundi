import { prisma } from "../src/lib/prisma";
import { syncBatchCountriesToDb } from "../src/lib/ai-agenda-curator";
import { ensureCountryIntelligence } from "../src/lib/country-intel";

async function main() {
  const start = Date.now();
  console.log(
    "[sync-all] Updating refresh tiers (HOT=1h, MODERATE=3h, STABLE=6h)..."
  );

  await prisma.country.updateMany({
    where: { tempo: "HOT" },
    data: { updateIntervalHours: 1 },
  });
  await prisma.country.updateMany({
    where: { tempo: "MODERATE" },
    data: { updateIntervalHours: 3 },
  });
  await prisma.country.updateMany({
    where: { tempo: "STABLE" },
    data: { updateIntervalHours: 6 },
  });

  const allCountries = await prisma.country.findMany({
    include: {
      _count: { select: { agendas: { where: { isActive: true } } } },
    },
    orderBy: { code: "asc" },
  });

  const forceAll = process.argv.includes("--force");
  const needAgendas = allCountries
    .filter((c) => forceAll || !c.lastSyncedAt || c._count.agendas < 3)
    .map((c) => c.code);

  console.log(
    `[sync-all] Need English agenda ingestion for ${needAgendas.length}/${allCountries.length} countries...`
  );

  // Process 2 batches of 6 in parallel (12 countries concurrently) for fast, safe ingestion
  const BATCH_SIZE = 6;
  const batches: string[][] = [];
  for (let i = 0; i < needAgendas.length; i += BATCH_SIZE) {
    batches.push(needAgendas.slice(i, i + BATCH_SIZE));
  }

  let completedBatches = 0;
  const CONCURRENCY = 2;

  async function worker(workerId: number) {
    while (batches.length > 0) {
      const batch = batches.shift();
      if (!batch) break;
      const synced = await syncBatchCountriesToDb(batch, true);
      completedBatches++;
      console.log(
        `[worker-${workerId}] Batch done (${batch.join(",")}) -> +${synced} countries (completed batches: ${completedBatches})`
      );
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, idx) => worker(idx + 1))
  );

  // Ensure Country Macro Intelligence (English Wikipedia + Wikidata + USD FX) for all countries
  const needInfo = allCountries
    .filter((c) => forceAll || !c.infoSyncedAt || !c.summary)
    .map((c) => c.code);

  console.log(
    `[sync-all] Syncing English country intelligence profiles for ${needInfo.length} countries...`
  );

  const INFO_BATCH = 3;
  for (let i = 0; i < needInfo.length; i += INFO_BATCH) {
    const slice = needInfo.slice(i, i + INFO_BATCH);
    await Promise.allSettled(
      slice.map((code) => ensureCountryIntelligence(code))
    );
    await new Promise((r) => setTimeout(r, 250));
  }

  const [finalSynced, finalAgendas, finalGemini, finalInfo] = await Promise.all([
    prisma.country.count({ where: { lastSyncedAt: { not: null } } }),
    prisma.agendaItem.count({ where: { isActive: true } }),
    prisma.agendaItem.count({
      where: { isActive: true, sourceOrigin: "GEMINI_GROUNDED" },
    }),
    prisma.country.count({ where: { infoSyncedAt: { not: null } } }),
  ]);

  console.log("[sync-all] COMPLETE!", {
    elapsedSec: Math.round((Date.now() - start) / 1000),
    totalCountries: allCountries.length,
    finalSynced,
    finalInfo,
    finalAgendas,
    finalGemini,
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[sync-all] Fatal error:", err);
  process.exit(1);
});
