import { NextRequest, NextResponse } from "next/server";
import { syncCountryAgendasToDb } from "@/lib/ai-agenda-curator";
import { ensureCountryIntelligence } from "@/lib/country-intel";
import { requireCronOrAdminAuth } from "@/lib/request-guard";

/**
 * Warms agendas and profiles for featured/pinned countries in the background.
 * Protected by CRON_SECRET (Bearer token or x-cron-secret header).
 */
export async function POST(request: NextRequest) {
  const authError = requireCronOrAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const rawCodes: unknown[] = Array.isArray(body?.codes) ? body.codes : [];
    const codes = rawCodes
      .map((c) => String(c || "").trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 5);

    await Promise.allSettled(
      codes.map(async (code) => {
        await Promise.allSettled([
          syncCountryAgendasToDb(code, false),
          ensureCountryIntelligence(code),
        ]);
      })
    );

    return NextResponse.json({ warmed: codes });
  } catch {
    return NextResponse.json({ warmed: [] });
  }
}
