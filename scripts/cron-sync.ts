import { prisma } from "../src/lib/prisma";
import { runSchedulerCycle } from "../src/lib/news-scheduler";

async function main() {
  const t0 = Date.now();
  console.log("[cron-sync] Starting scheduled news & Gemini 3.5 cycle...");
  const updated = await runSchedulerCycle(40);
  console.log(
    `[cron-sync] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — updated ${updated} countries.`
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[cron-sync] Error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
