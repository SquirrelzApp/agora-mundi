import { NextRequest, NextResponse } from "next/server";
import { detectVisitorLocale } from "@/lib/geo-language";
import { getLanguageOption } from "@/lib/language-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const detected = await detectVisitorLocale(request.headers);
    const language = getLanguageOption(detected.lang);
    return NextResponse.json({
      lang: detected.lang,
      countryCode: detected.countryCode,
      source: detected.source,
      language,
    });
  } catch (error) {
    console.error("GET /api/locale error:", error);
    return NextResponse.json({
      lang: "en",
      countryCode: null,
      source: "default",
      language: getLanguageOption("en"),
    });
  }
}
