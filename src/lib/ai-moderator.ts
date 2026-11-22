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
  /\b(fuck|fucking|shit|bitch|asshole|cunt|retard|motherfucker|bastard|dickhead)\b/i,
  /\b(amk|aq|oç|orospu|piç|sikik|siktir|yavşak|kahpe)\b/i,
];

const FALLBACK_RACISM_PATTERNS = [
  /\b(subhuman|ethnic\s*cleansing\s*now|kill\s*all\s+\w+|inferior\s*race|genocide\s*deserved|white\s*supremacy\s*now)\b/i,
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
      reason: `Your comment must be at least ${MIN_COMMENT_LENGTH} characters long.`,
      qualityScore: 0,
    };
  }

  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return {
      approved: false,
      violationCategory: "CHAR_LIMIT",
      reason: `Your comment exceeds the ${MAX_COMMENT_LENGTH}-character limit.`,
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
        "Images, photos, and videos are disabled on this platform. You may share text and external news/source links.",
      qualityScore: 0,
    };
  }

  // Repeated character spam e.g. "aaaaaaaaaaaa"
  if (/(.)\1{9,}/.test(trimmed)) {
    return {
      approved: false,
      violationCategory: "LOW_EFFORT_SPAM",
      reason: "Meaningless repeated character spam was detected.",
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
          "Racism, ethnic hate speech, or content targeting a group is strictly prohibited.",
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
          "Profanity, slurs, or personal insults were detected. Please express your argument respectfully.",
        qualityScore: 10,
      };
    }
  }

  const apiKey =
    process.env.GEMINI_MODERATION_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const modelName =
        process.env.GEMINI_MODERATION_MODEL ||
        process.env.GEMINI_NEWS_MODEL ||
        "gemini-3.5-flash-lite";
      const contextBlock = options?.isReply
        ? `\nType: Nested REPLY to another user's comment${
            options.parentExcerpt
              ? `\nParent Comment Excerpt: "${options.parentExcerpt}"`
              : ""
          }`
        : "\nType: Top-level comment on an agenda item";

      const runModerationCall = async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            ai.interactions.create({
              model: modelName,
              generation_config: {
                thinking_level: "low",
              },
              system_instruction: `You are the content moderator for globeTake, a global civic discourse platform.
STRICT RULES:
1. ONLY reject (approved: false) comments containing profanity, severe slurs, direct personal insults, racism, ethnic hate speech, or random keyboard-mash / commercial ad bot spam.
2. Concise user opinions (10+ characters), conversational replies (e.g., "I completely agree...", "I see this differently..."), sharp political critiques, questions, external news/article links, and tangential discussion MUST ALWAYS BE APPROVED (approved: true, violationCategory: "NONE").
3. NEVER reject a comment or reply merely for not repeating headline keywords or being brief agreement/disagreement (LOW_EFFORT_SPAM is strictly for gibberish or ad bots).
4. If rejected, write "reason" in clear, polite English.
5. Score the comment's intellectual contribution and clarity from 1 to 100 (qualityScore).`,
              input: `Country: ${countryName}\nAgenda Headline: ${agendaTitle}${contextBlock}\nUser Comment: "${commentText}"`,
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
            }),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("Gemini moderation timeout after 12000ms")),
                12_000
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      let interaction;
      try {
        interaction = await runModerationCall();
      } catch (firstErr) {
        const msg = String(firstErr instanceof Error ? firstErr.message : firstErr);
        if (/429|500|502|503|504|timeout|unavailable|fetch failed/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 800));
          interaction = await runModerationCall();
        } else {
          throw firstErr;
        }
      }

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
