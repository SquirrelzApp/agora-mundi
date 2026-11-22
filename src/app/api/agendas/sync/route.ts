import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCountryAgendasToDb } from "@/lib/ai-agenda-curator";
import { ensureCountryIntelligence } from "@/lib/country-intel";

/**
 * Forces a live refresh of a selected country's top 3 English agendas and profile
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const countryCode = String(body.countryCode || "US").toUpperCase();

    const exists = await prisma.country.findUnique({
      where: { code: countryCode },
      select: { code: true },
    });

    if (!exists) {
      return NextResponse.json(
        { error: "Country not found." },
        { status: 404 }
      );
    }

    await Promise.allSettled([
      syncCountryAgendasToDb(countryCode, true),
      ensureCountryIntelligence(countryCode),
    ]);

    return NextResponse.json({
      autonomous: true,
      countryCode,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/agendas/sync error:", error);
    return NextResponse.json(
      { error: "Live agenda refresh failed." },
      { status: 500 }
    );
  }
}
