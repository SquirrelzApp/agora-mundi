/**
 * Google Translate Service (On-demand translation utility & fallback)
 */
export async function translateWithGoogle(
  text: string,
  targetLang: string = "en"
): Promise<{ translatedText: string; detectedSourceLang: string; ok: boolean }> {
  if (!text || !text.trim()) {
    return { translatedText: text, detectedSourceLang: "auto", ok: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      targetLang
    )}&dt=t&q=${encodeURIComponent(text)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Google Translate HTTP ${response.status}`);
    }

    const data = await response.json();
    // data[0] contains array of translated segments: [[translated, original, ...], ...]
    const translatedSegments: string[] = Array.isArray(data?.[0])
      ? data[0].map((seg: unknown[]) => (typeof seg?.[0] === "string" ? seg[0] : ""))
      : [];

    const joined = translatedSegments.join("").trim();
    if (!joined) {
      throw new Error("Empty translation response");
    }

    const detectedSourceLang =
      typeof data?.[2] === "string" ? data[2] : "auto";

    return {
      translatedText: joined,
      detectedSourceLang,
      ok: true,
    };
  } catch (error) {
    console.warn("Google Translate API fallback:", error);
    return {
      translatedText: text,
      detectedSourceLang: "unknown",
      ok: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
