import worldCountriesDataset from "world-countries";

export interface LanguageOption {
  code: string;
  nativeName: string;
  englishName: string;
}

export const WORLD_LANGUAGES: LanguageOption[] = [
  { code: "en", nativeName: "English", englishName: "English" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish" },
  { code: "es", nativeName: "Español", englishName: "Spanish" },
  { code: "fr", nativeName: "Français", englishName: "French" },
  { code: "de", nativeName: "Deutsch", englishName: "German" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic" },
  { code: "ru", nativeName: "Русский", englishName: "Russian" },
  { code: "zh-CN", nativeName: "简体中文", englishName: "Chinese (Simplified)" },
  { code: "zh-TW", nativeName: "繁體中文", englishName: "Chinese (Traditional)" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese" },
  { code: "ko", nativeName: "한국어", englishName: "Korean" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi" },
  { code: "it", nativeName: "Italiano", englishName: "Italian" },
  { code: "nl", nativeName: "Nederlands", englishName: "Dutch" },
  { code: "pl", nativeName: "Polski", englishName: "Polish" },
  { code: "uk", nativeName: "Українська", englishName: "Ukrainian" },
  { code: "fa", nativeName: "فارسی", englishName: "Persian" },
  { code: "he", nativeName: "עברית", englishName: "Hebrew" },
  { code: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian" },
  { code: "ms", nativeName: "Bahasa Melayu", englishName: "Malay" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese" },
  { code: "th", nativeName: "ไทย", englishName: "Thai" },
  { code: "el", nativeName: "Ελληνικά", englishName: "Greek" },
  { code: "ro", nativeName: "Română", englishName: "Romanian" },
  { code: "hu", nativeName: "Magyar", englishName: "Hungarian" },
  { code: "cs", nativeName: "Čeština", englishName: "Czech" },
  { code: "sk", nativeName: "Slovenčina", englishName: "Slovak" },
  { code: "bg", nativeName: "Български", englishName: "Bulgarian" },
  { code: "sr", nativeName: "Српски", englishName: "Serbian" },
  { code: "hr", nativeName: "Hrvatski", englishName: "Croatian" },
  { code: "bs", nativeName: "Bosanski", englishName: "Bosnian" },
  { code: "sl", nativeName: "Slovenščina", englishName: "Slovenian" },
  { code: "sq", nativeName: "Shqip", englishName: "Albanian" },
  { code: "mk", nativeName: "Македонски", englishName: "Macedonian" },
  { code: "sv", nativeName: "Svenska", englishName: "Swedish" },
  { code: "no", nativeName: "Norsk", englishName: "Norwegian" },
  { code: "da", nativeName: "Dansk", englishName: "Danish" },
  { code: "fi", nativeName: "Suomi", englishName: "Finnish" },
  { code: "is", nativeName: "Íslenska", englishName: "Icelandic" },
  { code: "et", nativeName: "Eesti", englishName: "Estonian" },
  { code: "lv", nativeName: "Latviešu", englishName: "Latvian" },
  { code: "lt", nativeName: "Lietuvių", englishName: "Lithuanian" },
  { code: "az", nativeName: "Azərbaycan", englishName: "Azerbaijani" },
  { code: "ka", nativeName: "ქართული", englishName: "Georgian" },
  { code: "hy", nativeName: "Հայերեն", englishName: "Armenian" },
  { code: "kk", nativeName: "Қазақша", englishName: "Kazakh" },
  { code: "uz", nativeName: "Oʻzbekcha", englishName: "Uzbek" },
  { code: "ky", nativeName: "Кыргызча", englishName: "Kyrgyz" },
  { code: "tk", nativeName: "Türkmençe", englishName: "Turkmen" },
  { code: "tg", nativeName: "Тоҷикӣ", englishName: "Tajik" },
  { code: "mn", nativeName: "Монгол", englishName: "Mongolian" },
  { code: "ur", nativeName: "اردو", englishName: "Urdu" },
  { code: "bn", nativeName: "বাংলা", englishName: "Bengali" },
  { code: "ta", nativeName: "தமிழ்", englishName: "Tamil" },
  { code: "te", nativeName: "తెలుగు", englishName: "Telugu" },
  { code: "mr", nativeName: "मराठी", englishName: "Marathi" },
  { code: "pa", nativeName: "ਪੰਜਾਬੀ", englishName: "Punjabi" },
  { code: "ne", nativeName: "नेपाली", englishName: "Nepali" },
  { code: "si", nativeName: "සිංහල", englishName: "Sinhala" },
  { code: "my", nativeName: "မြန်မာ", englishName: "Burmese" },
  { code: "km", nativeName: "ខ្មែរ", englishName: "Khmer" },
  { code: "lo", nativeName: "ລາວ", englishName: "Lao" },
  { code: "tl", nativeName: "Filipino", englishName: "Filipino" },
  { code: "sw", nativeName: "Kiswahili", englishName: "Swahili" },
  { code: "am", nativeName: "አማርኛ", englishName: "Amharic" },
  { code: "so", nativeName: "Soomaali", englishName: "Somali" },
  { code: "af", nativeName: "Afrikaans", englishName: "Afrikaans" },
  { code: "ca", nativeName: "Català", englishName: "Catalan" },
  { code: "ga", nativeName: "Gaeilge", englishName: "Irish" },
  { code: "mt", nativeName: "Malti", englishName: "Maltese" },
  { code: "be", nativeName: "Беларуская", englishName: "Belarusian" },
  { code: "ps", nativeName: "پښتو", englishName: "Pashto" },
];

const LANGUAGE_MAP = new Map<string, LanguageOption>(
  WORLD_LANGUAGES.map((l) => [l.code, l])
);

const LEGACY_OR_ALIAS_MAP: Record<string, string> = {
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-sg": "zh-CN",
  "zh-tw": "zh-TW",
  "zh-hant": "zh-TW",
  "zh-hk": "zh-TW",
  "zh-mo": "zh-TW",
  iw: "he",
  in: "id",
  jw: "jv",
  fil: "tl",
  nb: "no",
  nn: "no",
  prs: "fa",
};

/**
 * Normalizes any BCP-47 / ISO language tag into a canonical code used across DB cache and translators.
 */
export function normalizeLanguageCode(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "en";
  const cleaned = raw.trim().replace(/_/g, "-").toLowerCase();
  if (!cleaned) return "en";

  if (LEGACY_OR_ALIAS_MAP[cleaned]) {
    return LEGACY_OR_ALIAS_MAP[cleaned];
  }

  // Handle Chinese variants with script/region
  if (cleaned.startsWith("zh-")) {
    if (cleaned.includes("hant") || cleaned.includes("tw") || cleaned.includes("hk") || cleaned.includes("mo")) {
      return "zh-TW";
    }
    return "zh-CN";
  }

  const base = cleaned.split("-")[0];
  if (LEGACY_OR_ALIAS_MAP[base]) {
    return LEGACY_OR_ALIAS_MAP[base];
  }

  if (/^[a-z]{2,3}$/.test(base)) {
    return base;
  }

  return "en";
}

export function getLanguageOption(rawCode: string): LanguageOption {
  const code = normalizeLanguageCode(rawCode);
  const known = LANGUAGE_MAP.get(code);
  if (known) return known;

  let englishName = code.toUpperCase();
  let nativeName = code.toUpperCase();
  try {
    const enNames = new Intl.DisplayNames(["en"], { type: "language" });
    englishName = enNames.of(code) || englishName;
    const natNames = new Intl.DisplayNames([code], { type: "language" });
    nativeName = natNames.of(code) || englishName;
  } catch {
    // ignore Intl fallback errors
  }

  return { code, nativeName, englishName };
}

/**
 * Explicit primary language mapping by ISO 3166-1 alpha-2 country code.
 */
const COUNTRY_PRIMARY_LANGUAGE: Record<string, string> = {
  // English-primary
  US: "en",
  GB: "en",
  AU: "en",
  NZ: "en",
  IE: "en",
  CA: "en",
  JM: "en",
  TT: "en",
  BS: "en",
  BB: "en",
  BZ: "en",
  GY: "en",
  ZA: "en",
  NG: "en",
  GH: "en",
  UG: "en",
  ZM: "en",
  ZW: "en",
  BW: "en",
  NA: "en",
  LR: "en",
  SL: "en",
  GM: "en",
  SG: "en",

  // Turkish & Turkic
  TR: "tr",
  XK_NCY: "tr",
  AZ: "az",
  KZ: "kk",
  UZ: "uz",
  KG: "ky",
  TM: "tk",

  // German
  DE: "de",
  AT: "de",
  CH: "de",
  LI: "de",
  LU: "fr",

  // French
  FR: "fr",
  BE: "nl",
  MC: "fr",
  SN: "fr",
  CI: "fr",
  ML: "fr",
  BF: "fr",
  NE: "fr",
  TG: "fr",
  BJ: "fr",
  GA: "fr",
  CG: "fr",
  CD: "fr",
  CM: "fr",
  GN: "fr",
  HT: "fr",
  MG: "fr",

  // Spanish
  ES: "es",
  MX: "es",
  AR: "es",
  CO: "es",
  CL: "es",
  PE: "es",
  VE: "es",
  EC: "es",
  GT: "es",
  CU: "es",
  BO: "es",
  DO: "es",
  HN: "es",
  PY: "es",
  SV: "es",
  NI: "es",
  CR: "es",
  PA: "es",
  UY: "es",
  GQ: "es",

  // Portuguese
  BR: "pt",
  PT: "pt",
  AO: "pt",
  MZ: "pt",
  CV: "pt",
  GW: "pt",
  TL: "pt",

  // Arabic
  SA: "ar",
  EG: "ar",
  AE: "ar",
  QA: "ar",
  KW: "ar",
  OM: "ar",
  BH: "ar",
  JO: "ar",
  LB: "ar",
  IQ: "ar",
  SY: "ar",
  YE: "ar",
  MA: "ar",
  DZ: "ar",
  TN: "ar",
  LY: "ar",
  SD: "ar",
  PS: "ar",
  MR: "ar",
  DJ: "ar",
  KM: "ar",

  // Slavic & Eastern Europe
  RU: "ru",
  BY: "be",
  UA: "uk",
  PL: "pl",
  CZ: "cs",
  SK: "sk",
  BG: "bg",
  RS: "sr",
  HR: "hr",
  BA: "bs",
  SI: "sl",
  ME: "sr",
  MK: "mk",
  AL: "sq",
  XK: "sq",

  // Western / Nordic / Southern Europe
  IT: "it",
  SM: "it",
  VA: "it",
  NL: "nl",
  SR: "nl",
  GR: "el",
  CY: "el",
  RO: "ro",
  MD: "ro",
  HU: "hu",
  SE: "sv",
  NO: "no",
  DK: "da",
  FI: "fi",
  IS: "is",
  EE: "et",
  LV: "lv",
  LT: "lt",
  MT: "mt",

  // East & Southeast & South Asia
  CN: "zh-CN",
  TW: "zh-TW",
  HK: "zh-TW",
  MO: "zh-TW",
  JP: "ja",
  KR: "ko",
  KP: "ko",
  IN: "hi",
  PK: "ur",
  BD: "bn",
  NP: "ne",
  LK: "si",
  ID: "id",
  MY: "ms",
  BN: "ms",
  VN: "vi",
  TH: "th",
  PH: "tl",
  MM: "my",
  KH: "km",
  LA: "lo",
  MN: "mn",

  // Middle East & Caucasus & Central Asia
  IR: "fa",
  AF: "fa",
  TJ: "tg",
  IL: "he",
  GE: "ka",
  AM: "hy",

  // Africa
  KE: "sw",
  TZ: "sw",
  ET: "am",
  SO: "so",
  ER: "am",
};

/**
 * Co-official languages for multilingual countries so Accept-Language refines the choice
 * (e.g. a French-Canadian browser in CA gets fr, a Walloon browser in BE gets fr, a Swiss French browser gets fr).
 */
const MULTILINGUAL_COUNTRY_OPTIONS: Record<string, string[]> = {
  CA: ["en", "fr"],
  CH: ["de", "fr", "it"],
  BE: ["nl", "fr", "de"],
  LU: ["fr", "de"],
  SG: ["en", "zh-CN", "ms", "ta"],
  CY: ["el", "tr"],
  IN: ["hi", "en", "bn", "te", "mr", "ta", "ur", "pa"],
  PH: ["tl", "en"],
  ZA: ["en", "af"],
  IE: ["en", "ga"],
  BY: ["be", "ru"],
  KZ: ["kk", "ru"],
};

const ISO3_TO_ISO1: Record<string, string> = {
  eng: "en",
  tur: "tr",
  spa: "es",
  fra: "fr",
  deu: "de",
  ara: "ar",
  rus: "ru",
  zho: "zh-CN",
  por: "pt",
  jpn: "ja",
  kor: "ko",
  hin: "hi",
  ita: "it",
  nld: "nl",
  pol: "pl",
  ukr: "uk",
  fas: "fa",
  prs: "fa",
  pus: "ps",
  heb: "he",
  ind: "id",
  msa: "ms",
  vie: "vi",
  tha: "th",
  ell: "el",
  ron: "ro",
  hun: "hu",
  ces: "cs",
  slk: "sk",
  bul: "bg",
  srp: "sr",
  hrv: "hr",
  bos: "bs",
  slv: "sl",
  sqi: "sq",
  mkd: "mk",
  swe: "sv",
  nor: "no",
  dan: "da",
  fin: "fi",
  isl: "is",
  est: "et",
  lav: "lv",
  lit: "lt",
  aze: "az",
  kat: "ka",
  hye: "hy",
  kaz: "kk",
  uzb: "uz",
  kir: "ky",
  tuk: "tk",
  tgk: "tg",
  mon: "mn",
  urd: "ur",
  ben: "bn",
  tam: "ta",
  tel: "te",
  mar: "mr",
  pan: "pa",
  nep: "ne",
  sin: "si",
  mya: "my",
  khm: "km",
  lao: "lo",
  fil: "tl",
  tgl: "tl",
  swa: "sw",
  amh: "am",
  som: "so",
  afr: "af",
  cat: "ca",
  gle: "ga",
  mlt: "mt",
  bel: "be",
};

const WORLD_COUNTRY_ISO1_CACHE = new Map<string, string>();
for (const c of worldCountriesDataset as Array<{
  cca2?: string;
  languages?: Record<string, string>;
}>) {
  if (!c.cca2 || !c.languages) continue;
  const firstIso3 = Object.keys(c.languages)[0];
  if (firstIso3 && ISO3_TO_ISO1[firstIso3]) {
    WORLD_COUNTRY_ISO1_CACHE.set(c.cca2.toUpperCase(), ISO3_TO_ISO1[firstIso3]);
  }
}

export function countryCodeToLanguage(
  countryCode?: string | null,
  preferredAcceptLanguages: string[] = []
): string {
  if (!countryCode) return "en";
  const upper = countryCode.trim().toUpperCase();

  const multi = MULTILINGUAL_COUNTRY_OPTIONS[upper];
  if (multi && preferredAcceptLanguages.length > 0) {
    for (const pref of preferredAcceptLanguages) {
      if (multi.includes(pref)) {
        return pref;
      }
    }
  }

  return (
    COUNTRY_PRIMARY_LANGUAGE[upper] ||
    WORLD_COUNTRY_ISO1_CACHE.get(upper) ||
    "en"
  );
}
