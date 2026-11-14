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

export function validateStructuralRules(
  commentText: string,
  sourceUrl?: string
): ModerationResult | null {
  const trimmed = commentText.trim();

  if (trimmed.length < 25) {
    return {
      approved: false,
      violationCategory: "CHAR_LIMIT",
      reason:
        "Sek tartışma standardı gereği argümanınız en az 25 karakter olmalıdır. Tek kelimelik veya yüzeysel tepkiler yayınlanmaz.",
      qualityScore: 0,
    };
  }

  if (trimmed.length > 1000) {
    return {
      approved: false,
      violationCategory: "CHAR_LIMIT",
      reason:
        "Argümanınız 1.000 karakter sınırını aşıyor. Fikrinizi daha öz ve vurucu şekilde ifade edin.",
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
        "Platformda görsel, fotoğraf, video veya medya dosyası paylaşımı kesinlikle yasaktır. Sadece metin ve harici haber/veri kaynağı linki paylaşabilirsiniz.",
      qualityScore: 0,
    };
  }

  return null;
}

export async function moderateComment(
  countryName: string,
  agendaTitle: string,
  commentText: string,
  sourceUrl?: string
): Promise<ModerationResult> {
  // 1. Check character limits & media/image prohibition (external links allowed)
  const structuralError = validateStructuralRules(commentText, sourceUrl);
  if (structuralError) {
    return structuralError;
  }

  // 2. Deterministic fast shield for blatant slurs/profanity
  for (const regex of FALLBACK_RACISM_PATTERNS) {
    if (regex.test(commentText)) {
      return {
        approved: false,
        violationCategory: "RACISM_HATE",
        reason:
          "Irkçılık, etnik nefret söylemi veya bir topluluğu hedef alan ifadeler manifesto gereği kesinlikle yayınlanmaz.",
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
          "Küfür, argo, beddua veya kişisel hakaret tespit edildi. Eleştirinizi argüman ve fikir düzeyinde kurgulayın.",
        qualityScore: 10,
      };
    }
  }

  // 3. Gemini AI Moderation via @google/genai (gemini-3.5-flash-lite)
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const interaction = await ai.interactions.create({
        model: "gemini-3.5-flash-lite",
        system_instruction: `Sen elit, sek bir politik ve entelektüel tartışma platformunun baş moderatörüsün.
Kurallar:
1. Küfür, argo, kişisel hakaret, ırkçılık, etnik aşağılama, pornografi veya trolleme/spam içeren yorumları KESİNLİKLE reddet (approved: false).
2. Harici kaynak linkleri (haber, makale, resmi veri) SERBESTTİR.
3. Sert politik eleştiri, keskin fikirler ve radikal tezler SERBESTTİR; yeter ki üslup temiz ve argüman odaklı olsun.
4. Yorumun analitik derinliğini ve ikna gücünü 1-100 arasında puanla (qualityScore).`,
        input: `Ülke: ${countryName}\nGündem Başlığı: ${agendaTitle}\nKullanıcı Yorumu: "${commentText}"`,
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

  // Heuristic quality score based on analytical structure when offline/no key
  const wordCount = commentText.trim().split(/\s+/).length;
  const hasSourceBonus = sourceUrl ? 6 : 0;
  const computedScore = Math.min(
    98,
    Math.max(72, 68 + Math.floor(wordCount * 0.6) + hasSourceBonus)
  );

  return {
    approved: true,
    violationCategory: "NONE",
    qualityScore: computedScore,
  };
}
