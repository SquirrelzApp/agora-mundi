import { NextRequest, NextResponse } from "next/server";
import { translateWithGoogle } from "@/lib/google-translate";
import { normalizeLanguageCode } from "@/lib/language-config";
import { checkRateLimit, getClientIp } from "@/lib/request-guard";

const MAX_TRANSLATE_CHARS = 1500;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const limit = checkRateLimit(`translate:${ip}`, 25, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many translation requests. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSec) },
        }
      );
    }

    const body = await request.json();
    const { text, targetLang = "en" } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Text to translate is required." },
        { status: 400 }
      );
    }

    if (text.length > MAX_TRANSLATE_CHARS) {
      return NextResponse.json(
        {
          error: `Text exceeds maximum translation length of ${MAX_TRANSLATE_CHARS} characters.`,
        },
        { status: 400 }
      );
    }

    const safeTargetLang = normalizeLanguageCode(
      typeof targetLang === "string" ? targetLang : "en"
    );

    const result = await translateWithGoogle(text.trim(), safeTargetLang);
    return NextResponse.json({
      provider: "Translation",
      translatedText: result.translatedText,
      detectedSourceLang: result.detectedSourceLang,
      targetLang: safeTargetLang,
    });
  } catch (error) {
    console.error("POST /api/translate error:", error);
    return NextResponse.json(
      { error: "Unable to reach translation service." },
      { status: 500 }
    );
  }
}
