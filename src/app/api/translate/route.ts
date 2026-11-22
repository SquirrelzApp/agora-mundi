import { NextRequest, NextResponse } from "next/server";
import { translateWithGoogle } from "@/lib/google-translate";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, targetLang = "en" } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text to translate is required." },
        { status: 400 }
      );
    }

    const result = await translateWithGoogle(text, targetLang);
    return NextResponse.json({
      provider: "Google Translate",
      translatedText: result.translatedText,
      detectedSourceLang: result.detectedSourceLang,
      targetLang,
    });
  } catch (error) {
    console.error("POST /api/translate error:", error);
    return NextResponse.json(
      { error: "Unable to reach Google Translate service." },
      { status: 500 }
    );
  }
}
