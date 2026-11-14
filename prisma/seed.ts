import { PrismaClient } from "@prisma/client";
import { getAllWorldCountries } from "../src/lib/world-countries";
import { syncCountryAgendasToDb } from "../src/lib/ai-agenda-curator";
import { ensureCountryIntelligence } from "../src/lib/country-intel";

const prisma = new PrismaClient();

const INITIAL_WARM_CODES = [
  "TR",
  "US",
  "DE",
  "GB",
  "AZ",
  "RU",
  "UA",
  "IL",
  "FR",
  "JP",
];

async function main() {
  const allWorldCountries = getAllWorldCountries();
  console.log(
    `[Agora Mundi] ${allWorldCountries.length} gerçek dünya ülkesi hazırlanıyor (0 uydurma veri)...`
  );

  // Mevcut sahte / eski kayıtları temizle
  await prisma.vote.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.session.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.agendaItem.deleteMany();
  await prisma.moderationLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.country.deleteMany();

  // Tüm dünya ülkelerini gerçek coğrafi, dil, başkent ve para birimi bilgileriyle oluştur
  await prisma.country.createMany({
    data: allWorldCountries.map((c) => ({
      code: c.code,
      nameTr: c.nameTr,
      nameEn: c.nameEn,
      officialNameTr: c.officialNameTr,
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
      `[Agora Mundi] İlk açılış hızı için öne çıkan ${INITIAL_WARM_CODES.length} ülkenin gerçek canlı gündemleri ve ülke künyeleri çekiliyor...`
    );

    // 5'erli paralel gruplarla hızlı ısıtma
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
    `[Agora Mundi] Tamamlandı! ${allWorldCountries.length} ülke ve ${syncedCount} canlı gerçek gündem maddesi hazır (0 sahte kullanıcı, 0 sahte yorum).`
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
