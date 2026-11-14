import { GoogleGenAI } from "@google/genai";

export interface ModerationResult {
  approved: boolean;
  reason?: string;
  violationCategory:
    | "NONE"
    | "CHAR_LIMIT"
    | "MEDIA_FORBIDDEN"
    | "PROFANITY"
    | "RACISM_HATE"
    | "PERSONAL_INSULT"
    | "LOW_EFFORT_SPAM";
  qualityScore: number;
}

const IMAGE_OR_MEDIA_REGEX =
  /(!\[.*?\]\(.*?\))|(<img\b|<video\b|<iframe\b)|(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|mp4|webm|mov|avi|mkv)(?:\?\S*)?)/i;

const FALLBACK_PROFANITY_PATTERNS = [
  /\b(amk|aq|oç|orospu|piç|sikik|siktir|göt|yavşak|kahpe|ibne|geri\s*zekalı|aptal\s*herif|vatan\s*haini\s*köpek|belasını\s*versin|gebersin)\b/i,
  /\b(fuck|shit|bitch|asshole|cunt|retard|subhuman|parasites|kill\s*all)\b/i,
];

const FALLBACK_RACISM_PATTERNS = [
  /\b(alt\s*ırk|kökünü\s*kazımak|hepsini\s*yakmak|ırkını\s*sikeyim|aşağılık\s*ırk|soykırım\s*müstehak|subhuman|ethnic\s*cleansing\s*now)\b/i,
];

export const MIN_COMMENT_LENGTH = 10;
export const MAX_COMMENT_LENGTH = 1000;

export function validateStructuralRules(
  commentText: string,
  sourceUrl?: string
): ModerationResult | null {
  const trimmed = commentText.trim();

  if (trimmed.length < MIN_COMMENT_LENGTH) {
    return {
      approved: false,
      violationCategory: "CHAR_LIMIT",
      reason: `Yorumunuz en az ${MIN_COMMENT_LENGTH} karakter olmalıdır.`,
      qualityScore: 0,
    };
  }

  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return {
      approved: false,
      violationCategory: "CHAR_LIMIT",
      reason: `Yorumunuz ${MAX_COMMENT_LENGTH} karakter sınırını aşıyor.`,
      qualityScore: 0,
    };
  }

  if (
    IMAGE_OR_MEDIA_REGEX.test(trimmed) ||
    (sourceUrl && IMAGE_OR_MEDIA_REGEX.test(sourceUrl))
  ) {
    return {
      approved: false,
      violationCategory: "MEDIA_FORBIDDEN",
      reason:
        "Platformda görsel, fotoğraf veya video paylaşımı kapalıdır. Metin ve harici kaynak/haber bağlantısı paylaşabilirsiniz.",
      qualityScore: 0,
    };
  }

  // Repeated character spam e.g. "aaaaaaaaaaaa"
  if (/(.)\1{9,}/.test(trimmed)) {
    return {
      approved: false,
      violationCategory: "LOW_EFFORT_SPAM",
      reason: "Anlamsız karakter tekrarı (spam) tespit edildi.",
      qualityScore: 0,
    };
  }

  return null;
}

export interface ModerationContextOptions {
  isReply?: boolean;
  parentExcerpt?: string;
}

export async function moderateComment(
  countryName: string,
  agendaTitle: string,
  commentText: string,
  sourceUrl?: string,
  options?: ModerationContextOptions
): Promise<ModerationResult> {
  const structuralError = validateStructuralRules(commentText, sourceUrl);
  if (structuralError) {
    return structuralError;
  }

  for (const regex of FALLBACK_RACISM_PATTERNS) {
    if (regex.test(commentText)) {
      return {
        approved: false,
        violationCategory: "RACISM_HATE",
        reason:
          "Irkçılık, etnik nefret söylemi veya bir topluluğu hedef alan ifadeler kesinlikle yayınlanmaz.",
        qualityScore: 5,
      };
    }
  }

  for (const regex of FALLBACK_PROFANITY_PATTERNS) {
    if (regex.test(commentText)) {
      return {
        approved: false,
        violationCategory: "PROFANITY",
        reason:
          "Küfür, argo veya kişisel hakaret tespit edildi. Lütfen düşüncenizi saygılı bir dille ifade edin.",
        qualityScore: 10,
      };
    }
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const modelName = process.env.GEMINI_NEWS_MODEL || "gemini-3.5-flash-lite";
      const contextBlock = options?.isReply
        ? `\nTür: Başka bir kullanıcı yorumuna ALT YANIT${options.parentExcerpt ? `\nÜst Yorum Özeti: "${options.parentExcerpt}"` : ""}`
        : "\nTür: Gündem maddesine ana yorum";

      const interaction = await ai.interactions.create({
        model: modelName,
        generation_config: {
          thinking_level: "low",
        },
        system_instruction: `Sen küresel gündem tartışma platformu globeTake'in içerik moderatörüsün.
KESİN KURALLAR:
1. YALNIZCA küfür, ağır argo, doğrudan kişisel hakaret, ırkçılık, etnik nefret söylemi veya rastgele klavye tuşlaması / ticari reklam bot spam'i içeren yorumları reddet (approved: false).
2. Kısa ve net kullanıcı görüşleri (10+ karakter), sohbet tarzı alt yanıtlar (ör. "Kesinlikle katılıyorum...", "Bu noktada farklı düşünüyorum..."), sert politik eleştiriler, sorular, harici haber/makale linkleri ve dolaylı tartışmalar HER ZAMAN ONAYLANMALIDIR (approved: true, violationCategory: "NONE").
3. Bir yorumu veya alt yanıtı salt "başlıkla doğrudan kelimesi kelimesine örtüşmüyor" veya "kısa katılma/itiraz cümlesi" diye ASLA reddetme (LOW_EFFORT_SPAM yalnızca anlamsız harf dizileri veya reklam botları içindir).
4. Yorumun katkı ve ifade kalitesini 1-100 arasında puanla (qualityScore).`,
        input: `Ülke: ${countryName}\nGündem Başlığı: ${agendaTitle}${contextBlock}\nKullanıcı Yorumu: "${commentText}"`,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: {
              approved: { type: "boolean" },
              reason: { type: "string" },
              violationCategory: {
                type: "string",
                enum: [
                  "NONE",
                  "PROFANITY",
                  "RACISM_HATE",
                  "PERSONAL_INSULT",
                  "LOW_EFFORT_SPAM",
                ],
              },
              qualityScore: { type: "integer" },
            },
            required: ["approved", "violationCategory", "qualityScore"],
          },
        },
      });

      if (interaction.output_text) {
        const parsed = JSON.parse(interaction.output_text) as ModerationResult;
        return parsed;
      }
    } catch (err) {
      console.warn("Gemini moderation fallback used:", err);
    }
  }

  const wordCount = commentText.trim().split(/\s+/).length;
  const hasSourceBonus = sourceUrl ? 6 : 0;
  const computedScore = Math.min(
    98,
    Math.max(70, 68 + Math.floor(wordCount * 0.65) + hasSourceBonus)
  );

  return {
    approved: true,
    violationCategory: "NONE",
    qualityScore: computedScore,
  };
}
