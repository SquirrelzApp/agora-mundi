import { PrismaClient } from "@prisma/client";
import { getAllWorldCountries } from "../src/lib/world-countries";
import { syncCountryAgendasToDb } from "../src/lib/ai-agenda-curator";
import { ensureCountryIntelligence } from "../src/lib/country-intel";

const prisma = new PrismaClient();

const INITIAL_WARM_CODES = [
  "US",
  "GB",
  "DE",
  "FR",
  "TR",
  "RU",
  "UA",
  "IL",
  "CN",
  "JP",
];

async function main() {
  const allWorldCountries = getAllWorldCountries();
  console.log(
    `[globeTake] Preparing ${allWorldCountries.length} real world countries (0 fabricated data)...`
  );

  // Clear existing records cleanly
  await prisma.vote.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.session.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.agendaItem.deleteMany();
  await prisma.moderationLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.country.deleteMany();

  // Seed all world countries with real geographic, language, capital, and currency metadata in English
  await prisma.country.createMany({
    data: allWorldCountries.map((c) => ({
      code: c.code,
      name: c.name,
      officialName: c.officialName,
      capital: c.capital,
      region: c.region,
      subregion: c.subregion,
      flagEmoji: c.flagEmoji,
      areaKm2: c.areaKm2,
      currencyCode: c.currencyCode,
      currencyName: c.currencyName,
      currencySymbol: c.currencySymbol,
      languagesJson: JSON.stringify(c.languages),
      callingCode: c.callingCode,
      tempo: c.tempo,
      updateIntervalHours: c.updateIntervalHours,
      mapX: c.coords[0],
      mapY: c.coords[1],
      lastSyncedAt: null,
      infoSyncedAt: null,
    })),
  });

  const skipWarm = process.argv.includes("--offline");
  if (!skipWarm) {
    console.log(
      `[globeTake] Warming live English agendas & country profiles for ${INITIAL_WARM_CODES.length} featured countries...`
    );

    // Parallel groups of 5 for fast warm-up
    for (let i = 0; i < INITIAL_WARM_CODES.length; i += 5) {
      const batch = INITIAL_WARM_CODES.slice(i, i + 5);
      await Promise.allSettled(
        batch.map(async (code) => {
          await Promise.allSettled([
            syncCountryAgendasToDb(code, true),
            ensureCountryIntelligence(code),
          ]);
        })
      );
    }
  }

  const syncedCount = await prisma.agendaItem.count({
    where: { isActive: true },
  });
  console.log(
    `[globeTake] Done! ${allWorldCountries.length} countries and ${syncedCount} live English agendas ready (0 fake users, 0 fake comments).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
