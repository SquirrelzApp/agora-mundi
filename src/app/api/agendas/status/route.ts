import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSchedulerStatusSnapshot } from "@/lib/news-scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const [totalCountries, syncedCountries, activeAgendas, geminiAgendas] =
    await Promise.all([
      prisma.country.count(),
      prisma.country.count({ where: { lastSyncedAt: { not: null } } }),
      prisma.agendaItem.count({ where: { isActive: true } }),
      prisma.agendaItem.count({
        where: { isActive: true, sourceOrigin: "GEMINI_GROUNDED" },
      }),
    ]);

  return NextResponse.json({
    scheduler: getSchedulerStatusSnapshot(),
    database: {
      totalCountries,
      syncedCountries,
      activeAgendas,
      geminiAgendas,
    },
  });
}
