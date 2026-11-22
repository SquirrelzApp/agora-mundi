/**
 * Google Translate Service (On-demand user comment translation utility)
 * Uses Google Translate endpoint directly when a reader requests translation of a foreign-language comment.
 */
export async function translateWithGoogle(
  text: string,
  targetLang: string = "en"
): Promise<{ translatedText: string; detectedSourceLang: string }> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      targetLang
    )}&dt=t&q=${encodeURIComponent(text)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Google Translate HTTP ${response.status}`);
    }

    const data = await response.json();
    // data[0] contains array of translated segments: [[translated, original, ...], ...]
    const translatedSegments: string[] = Array.isArray(data?.[0])
      ? data[0].map((seg: unknown[]) => (typeof seg?.[0] === "string" ? seg[0] : ""))
      : [text];

    const detectedSourceLang =
      typeof data?.[2] === "string" ? data[2] : "auto";

    return {
      translatedText: translatedSegments.join(""),
      detectedSourceLang,
    };
  } catch (error) {
    console.warn("Google Translate API fallback:", error);
    return {
      translatedText: text,
      detectedSourceLang: "unknown",
    };
  }
}
