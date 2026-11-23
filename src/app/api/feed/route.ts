import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAgendaTranslations } from "@/lib/agenda-translator";
import { normalizeLanguageCode } from "@/lib/language-config";
import { getClientIp } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const targetLang = normalizeLanguageCode(
      request.nextUrl.searchParams.get("lang") ||
        request.cookies.get("globetake_lang")?.value ||
        "en"
    );
    const [
      recentAgendasRaw,
      recentComments,
      totalCountries,
      syncedCountriesCount,
      totalActiveAgendas,
      totalComments,
      totalUsers,
    ] = await Promise.all([
      prisma.agendaItem.findMany({
        where: { isActive: true },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 18,
        include: {
          country: {
            select: {
              code: true,
              name: true,
              flagEmoji: true,
              region: true,
              tempo: true,
            },
          },
        },
      }),
      prisma.comment.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarColor: true,
              title: true,
            },
          },
          agendaItem: {
            select: {
              id: true,
              slot: true,
              title: true,
              countryCode: true,
              country: {
                select: {
                  code: true,
                  name: true,
                  flagEmoji: true,
                },
              },
            },
          },
        },
      }),
      prisma.country.count(),
      prisma.country.count({ where: { lastSyncedAt: { not: null } } }),
      prisma.agendaItem.count({ where: { isActive: true } }),
      prisma.comment.count(),
      prisma.user.count(),
    ]);

    // Diversify countries in global pulse feed (max 1 slot per country in top pulse)
    const seenCountry = new Set<string>();
    const diverseAgendas = [];
    for (const ag of recentAgendasRaw) {
      if (seenCountry.has(ag.countryCode) && diverseAgendas.length < 10) {
        continue;
      }
      seenCountry.add(ag.countryCode);
      let sources = [];
      try {
        sources = JSON.parse(ag.sourcesJson || "[]");
      } catch {
        sources = [];
      }
      diverseAgendas.push({
        id: ag.id,
        slot: ag.slot,
        title: ag.title,
        summary: ag.summary,
        category: ag.category,
        commentCount: ag.commentCount,
        publishedAt: ag.publishedAt || ag.createdAt,
        sources,
        country: ag.country,
      });
      if (diverseAgendas.length >= 12) break;
    }

    const translations = await ensureAgendaTranslations(
      diverseAgendas.map((ag) => ({
        id: ag.id,
        title: ag.title,
        summary: ag.summary,
      })),
      targetLang,
      { rateLimitKey: `agenda-tr:${getClientIp(request)}` }
    );

    const localizedAgendas = diverseAgendas.map((ag) => {
      const tr = translations.get(ag.id);
      return tr
        ? { ...ag, title: tr.title, summary: tr.summary }
        : ag;
    });

    return NextResponse.json({
      recentAgendas: localizedAgendas,
      recentComments,
      lang: targetLang,
      stats: {
        totalCountries,
        syncedCountriesCount,
        totalActiveAgendas,
        totalComments,
        totalUsers,
      },
    });
  } catch (error) {
    console.error("GET /api/feed error:", error);
    return NextResponse.json(
      { error: "Failed to load global feed." },
      { status: 500 }
    );
  }
}
