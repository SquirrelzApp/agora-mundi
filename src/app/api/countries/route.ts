import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllWorldCountries } from "@/lib/world-countries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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

    return NextResponse.json({ countries, total: count });
  } catch (error) {
    console.error("GET /api/countries error:", error);
    return NextResponse.json(
      { error: "Failed to load country agendas." },
      { status: 500 }
    );
  }
}
