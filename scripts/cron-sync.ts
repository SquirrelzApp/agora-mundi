import { prisma } from "../src/lib/prisma";
import { runSchedulerCycle } from "../src/lib/news-scheduler";

async function waitForDatabase(maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      console.warn(
        `[cron-sync] DB connectivity check failed (attempt ${attempt}/${maxAttempts}):`,
        err instanceof Error ? err.message : err
      );
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, attempt * 2500));
    }
  }
}

async function main() {
  const t0 = Date.now();
  console.log("[cron-sync] Starting scheduled English news & Gemini 3.5 cycle...");

  await waitForDatabase(3);
  const updated = await runSchedulerCycle(55);

  const [activeAgendas, geminiAgendas] = await Promise.all([
    prisma.agendaItem.count({ where: { isActive: true } }),
    prisma.agendaItem.count({
      where: { isActive: true, sourceOrigin: "GEMINI_GROUNDED" },
    }),
  ]);

  console.log(
    `[cron-sync] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — updated ${updated} countries (active: ${activeAgendas}, gemini: ${geminiAgendas}).`
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[cron-sync] Error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
