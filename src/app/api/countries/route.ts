import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllWorldCountries } from "@/lib/world-countries";
import { getCachedAgendaTranslations } from "@/lib/agenda-translator";
import { normalizeLanguageCode } from "@/lib/language-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const targetLang = normalizeLanguageCode(
      request.nextUrl.searchParams.get("lang") ||
        request.cookies.get("globetake_lang")?.value ||
        "en"
    );

    let count = await prisma.country.count();

    // Auto-initialize country catalog if DB is brand new
    if (count === 0) {
      const catalog = getAllWorldCountries();
      await prisma.country.createMany({
        data: catalog.map((c) => ({
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
        })),
      });
      count = catalog.length;
    }

    const countries = await prisma.country.findMany({
      include: {
        agendas: {
          where: { isActive: true },
          orderBy: { slot: "asc" },
          select: {
            id: true,
            slot: true,
            title: true,
            category: true,
            commentCount: true,
            publishedAt: true,
            _count: {
              select: { comments: true },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    if (targetLang === "en") {
      return NextResponse.json({ countries, total: count, lang: targetLang });
    }

    const activeAgendaIds = countries.flatMap((c) => c.agendas.map((a) => a.id));
    const cachedMap = await getCachedAgendaTranslations(
      activeAgendaIds,
      targetLang
    );

    const localizedCountries = countries.map((c) => ({
      ...c,
      agendas: c.agendas.map((a) => {
        const tr = cachedMap.get(a.id);
        return tr ? { ...a, title: tr.title } : a;
      }),
    }));

    return NextResponse.json({
      countries: localizedCountries,
      total: count,
      lang: targetLang,
    });
  } catch (error) {
    console.error("GET /api/countries error:", error);
    return NextResponse.json(
      { error: "Failed to load country agendas." },
      { status: 500 }
    );
  }
}
