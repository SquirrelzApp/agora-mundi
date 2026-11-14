import { feature } from "topojson-client";
import { geoCentroid } from "d3-geo";
import worldAtlasData from "world-atlas/countries-110m.json";
import worldCountriesDataset from "world-countries";

export interface WorldCountryMeta {
  code: string; // ISO-2 (or XK / XK_NCY)
  numericId: string;
  nameTr: string;
  nameEn: string;
  officialNameTr: string;
  capital: string | null;
  flagEmoji: string;
  region: string;
  subregion: string | null;
  areaKm2: number | null;
  currencyCode: string | null;
  currencyName: string | null;
  currencySymbol: string | null;
  languages: string[];
  callingCode: string | null;
  tempo: "HOT" | "MODERATE" | "STABLE";
  updateIntervalHours: number;
  coords: [number, number]; // [lon, lat]
}

// ISO-3166-1 numeric -> ISO-3166-1 alpha-2 mapping for all countries in world-atlas
export const NUMERIC_TO_ALPHA2: Record<string, string> = {
  "004": "AF",
  "008": "AL",
  "012": "DZ",
  "024": "AO",
  "031": "AZ",
  "032": "AR",
  "036": "AU",
  "040": "AT",
  "044": "BS",
  "050": "BD",
  "051": "AM",
  "056": "BE",
  "064": "BT",
  "068": "BO",
  "070": "BA",
  "072": "BW",
  "076": "BR",
  "084": "BZ",
  "090": "SB",
  "096": "BN",
  "100": "BG",
  "104": "MM",
  "108": "BI",
  "112": "BY",
  "116": "KH",
  "120": "CM",
  "124": "CA",
  "140": "CF",
  "144": "LK",
  "148": "TD",
  "152": "CL",
  "156": "CN",
  "158": "TW",
  "170": "CO",
  "178": "CG",
  "180": "CD",
  "188": "CR",
  "191": "HR",
  "192": "CU",
  "196": "CY",
  "203": "CZ",
  "204": "BJ",
  "208": "DK",
  "214": "DO",
  "218": "EC",
  "222": "SV",
  "226": "GQ",
  "231": "ET",
  "232": "ER",
  "233": "EE",
  "238": "FK",
  "242": "FJ",
  "246": "FI",
  "250": "FR",
  "262": "DJ",
  "266": "GA",
  "268": "GE",
  "270": "GM",
  "275": "PS",
  "276": "DE",
  "288": "GH",
  "300": "GR",
  "304": "GL",
  "320": "GT",
  "324": "GN",
  "328": "GY",
  "332": "HT",
  "340": "HN",
  "348": "HU",
  "352": "IS",
  "356": "IN",
  "360": "ID",
  "364": "IR",
  "368": "IQ",
  "372": "IE",
  "376": "IL",
  "380": "IT",
  "384": "CI",
  "388": "JM",
  "392": "JP",
  "398": "KZ",
  "400": "JO",
  "404": "KE",
  "408": "KP",
  "410": "KR",
  "414": "KW",
  "417": "KG",
  "418": "LA",
  "422": "LB",
  "426": "LS",
  "428": "LV",
  "430": "LR",
  "434": "LY",
  "440": "LT",
  "442": "LU",
  "450": "MG",
  "454": "MW",
  "458": "MY",
  "466": "ML",
  "478": "MR",
  "484": "MX",
  "496": "MN",
  "498": "MD",
  "499": "ME",
  "504": "MA",
  "508": "MZ",
  "512": "OM",
  "516": "NA",
  "524": "NP",
  "528": "NL",
  "540": "NC",
  "548": "VU",
  "554": "NZ",
  "558": "NI",
  "562": "NE",
  "566": "NG",
  "578": "NO",
  "586": "PK",
  "591": "PA",
  "598": "PG",
  "600": "PY",
  "604": "PE",
  "608": "PH",
  "616": "PL",
  "620": "PT",
  "624": "GW",
  "626": "TL",
  "630": "PR",
  "634": "QA",
  "642": "RO",
  "643": "RU",
  "646": "RW",
  "682": "SA",
  "686": "SN",
  "688": "RS",
  "694": "SL",
  "703": "SK",
  "704": "VN",
  "705": "SI",
  "706": "SO",
  "710": "ZA",
  "716": "ZW",
  "724": "ES",
  "728": "SS",
  "729": "SD",
  "732": "EH",
  "740": "SR",
  "748": "SZ",
  "752": "SE",
  "756": "CH",
  "760": "SY",
  "762": "TJ",
  "764": "TH",
  "768": "TG",
  "780": "TT",
  "784": "AE",
  "788": "TN",
  "792": "TR",
  "795": "TM",
  "800": "UG",
  "804": "UA",
  "807": "MK",
  "818": "EG",
  "826": "GB",
  "834": "TZ",
  "840": "US",
  "854": "BF",
  "858": "UY",
  "860": "UZ",
  "862": "VE",
  "887": "YE",
  "894": "ZM",
};

const HOT_CODES = new Set([
  "TR",
  "IL",
  "PS",
  "UA",
  "RU",
  "US",
  "SY",
  "LB",
  "IR",
  "SD",
  "YE",
  "MM",
  "TW",
]);

const MODERATE_CODES = new Set([
  "DE",
  "FR",
  "GB",
  "CN",
  "IN",
  "BR",
  "AZ",
  "AM",
  "GR",
  "IQ",
  "EG",
  "SA",
  "PK",
  "AF",
  "KP",
  "KR",
  "JP",
  "VE",
  "AR",
  "MX",
  "PL",
  "IT",
  "ES",
  "ZA",
  "NG",
  "ET",
]);

const COORD_OVERRIDES: Record<string, [number, number]> = {
  TR: [35.24, 39.0],
  RU: [45.0, 56.0],
  US: [-98.5, 39.5],
  FR: [2.4, 46.6],
  NO: [9.0, 61.0],
  GB: [-2.0, 54.0],
};

const CAPITAL_TR_OVERRIDES: Record<string, string> = {
  AZ: "Bakü",
  AT: "Viyana",
  BE: "Brüksel",
  BG: "Sofya",
  CN: "Pekin",
  CY: "Lefkoşa",
  CZ: "Prag",
  DK: "Kopenhag",
  EG: "Kahire",
  GB: "Londra",
  GE: "Tiflis",
  GR: "Atina",
  HU: "Budapeşte",
  IN: "Yeni Delhi",
  IQ: "Bağdat",
  IR: "Tahran",
  IT: "Roma",
  KW: "Kuveyt",
  LB: "Beyrut",
  PL: "Varşova",
  RO: "Bükreş",
  RU: "Moskova",
  SA: "Riyad",
  RS: "Belgrad",
  CH: "Bern",
  SY: "Şam",
  TR: "Ankara",
  UA: "Kiev",
  US: "Washington, D.C.",
  XK: "Priştine",
  XK_NCY: "Lefkoşa",
};

const SUBREGION_TR_MAP: Record<string, string> = {
  "Western Asia": "Batı Asya",
  "Central Asia": "Orta Asya",
  "Southern Asia": "Güney Asya",
  "Eastern Asia": "Doğu Asya",
  "South-Eastern Asia": "Güneydoğu Asya",
  "Northern Europe": "Kuzey Avrupa",
  "Western Europe": "Batı Avrupa",
  "Eastern Europe": "Doğu Avrupa",
  "Southern Europe": "Güney Avrupa",
  "Southeast Europe": "Güneydoğu Avrupa",
  "Central Europe": "Orta Avrupa",
  "North America": "Kuzey Amerika",
  "South America": "Güney Amerika",
  "Central America": "Orta Amerika",
  Caribbean: "Karayipler",
  "Northern Africa": "Kuzey Afrika",
  "Western Africa": "Batı Afrika",
  "Middle Africa": "Orta Afrika",
  "Eastern Africa": "Doğu Afrika",
  "Southern Africa": "Güney Afrika",
  "Australia and New Zealand": "Avustralya ve Yeni Zelanda",
  Melanesia: "Melanezya",
  Micronesia: "Mikronezya",
  Polynesia: "Polinezya",
};

export function isoToFlagEmoji(code: string): string {
  const clean = code.slice(0, 2).toUpperCase();
  if (clean.length !== 2) return "🏳️";
  return clean.replace(/./g, (char) =>
    String.fromCodePoint(127397 + char.charCodeAt(0))
  );
}

function classifyRegion(lon: number, lat: number, code: string): string {
  if (
    [
      "TR",
      "AZ",
      "GE",
      "AM",
      "RU",
      "KZ",
      "UZ",
      "TM",
      "KG",
      "TJ",
      "IL",
      "PS",
      "LB",
      "SY",
      "JO",
      "IQ",
      "IR",
      "SA",
      "AE",
      "QA",
      "KW",
      "OM",
      "YE",
      "CY",
      "XK_NCY",
    ].includes(code)
  ) {
    return "Avrasya & Orta Doğu";
  }
  if (lon < -25) return "Amerika";
  if (lat > 34 && lon >= -25 && lon <= 45) return "Avrupa";
  if (lat <= 34 && lon >= -25 && lon <= 52) return "Afrika";
  return "Asya-Pasifik";
}

let cachedCatalog: WorldCountryMeta[] | null = null;

export function getAllWorldCountries(): WorldCountryMeta[] {
  if (cachedCatalog) return cachedCatalog;

  const trRegionDisplay = new Intl.DisplayNames(["tr"], { type: "region" });
  const trCurrencyDisplay = new Intl.DisplayNames(["tr"], { type: "currency" });
  const trLangDisplay = new Intl.DisplayNames(["tr"], { type: "language" });

  // Index world-countries by ISO alpha-2
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wcByAlpha2 = new Map<string, any>();
  for (const item of worldCountriesDataset) {
    if (item.cca2) {
      wcByAlpha2.set(item.cca2.toUpperCase(), item);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topo = worldAtlasData as any;
  const geo = feature(topo, topo.objects.countries) as unknown as {
    features: Array<{
      id?: string | number;
      properties?: { name?: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      geometry: any;
    }>;
  };

  const results: WorldCountryMeta[] = [];
  const seenCodes = new Set<string>();

  for (const feat of geo.features) {
    const rawId = feat.id !== undefined ? String(feat.id).padStart(3, "0") : "";
    const propName = feat.properties?.name || "";

    // Skip Antarctica and French Southern Lands
    if (rawId === "010" || rawId === "260") continue;

    let code = NUMERIC_TO_ALPHA2[rawId];
    let customNameTr: string | null = null;
    let customNameEn: string | null = null;
    let customOfficialTr: string | null = null;
    let customFlag: string | null = null;

    if (!code) {
      if (propName === "N. Cyprus") {
        code = "XK_NCY";
        customNameTr = "KKTC (Kuzey Kıbrıs)";
        customNameEn = "Northern Cyprus";
        customOfficialTr = "Kuzey Kıbrıs Türk Cumhuriyeti";
        customFlag = "🇹🇷";
      } else if (propName === "Kosovo") {
        code = "XK";
        customNameTr = "Kosova";
        customNameEn = "Kosovo";
        customOfficialTr = "Kosova Cumhuriyeti";
        customFlag = "🇽🇰";
      } else {
        continue;
      }
    }

    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    const wc = wcByAlpha2.get(code);

    let nameTr = customNameTr || propName;
    if (!customNameTr) {
      try {
        nameTr = trRegionDisplay.of(code) || wc?.translations?.tur?.common || propName;
      } catch {
        nameTr = wc?.translations?.tur?.common || propName;
      }
    }

    const nameEn =
      customNameEn ||
      (code === "TR" ? "Turkey" : wc?.name?.common || propName);

    const officialNameTr =
      customOfficialTr || wc?.translations?.tur?.official || nameTr;

    const capital =
      CAPITAL_TR_OVERRIDES[code] ||
      (Array.isArray(wc?.capital) && wc.capital.length > 0
        ? wc.capital[0]
        : null);

    let currencyCode: string | null = null;
    let currencyName: string | null = null;
    let currencySymbol: string | null = null;

    if (code === "XK_NCY") {
      currencyCode = "TRY";
      currencyName = "Türk Lirası";
      currencySymbol = "₺";
    } else if (wc?.currencies && typeof wc.currencies === "object") {
      const cKeys = Object.keys(wc.currencies);
      if (cKeys.length > 0) {
        currencyCode = cKeys[0];
        currencySymbol = wc.currencies[currencyCode]?.symbol || currencyCode;
        try {
          currencyName =
            trCurrencyDisplay.of(currencyCode) ||
            wc.currencies[currencyCode]?.name ||
            currencyCode;
        } catch {
          currencyName = wc.currencies[currencyCode]?.name || currencyCode;
        }
      }
    }

    const languages: string[] = [];
    if (code === "XK_NCY") {
      languages.push("Türkçe");
    } else if (wc?.languages && typeof wc.languages === "object") {
      for (const [langCode, langEn] of Object.entries(wc.languages)) {
        try {
          const trLang = trLangDisplay.of(langCode);
          languages.push(trLang ? trLang.charAt(0).toUpperCase() + trLang.slice(1) : String(langEn));
        } catch {
          languages.push(String(langEn));
        }
      }
    }

    let callingCode: string | null = null;
    if (code === "XK_NCY") {
      callingCode = "+90";
    } else if (wc?.idd?.root) {
      const suffix =
        Array.isArray(wc.idd.suffixes) && wc.idd.suffixes.length === 1
          ? wc.idd.suffixes[0]
          : "";
      callingCode = `${wc.idd.root}${suffix}`;
    }

    const rawSubregion = wc?.subregion || "";
    const subregion = rawSubregion
      ? SUBREGION_TR_MAP[rawSubregion] || rawSubregion
      : null;

    const areaKm2 =
      code === "XK_NCY"
        ? 3355
        : typeof wc?.area === "number" && wc.area > 0
        ? wc.area
        : null;

    const centroid = COORD_OVERRIDES[code] || geoCentroid(feat as never);
    const coords: [number, number] = [
      Number.isFinite(centroid[0]) ? centroid[0] : 0,
      Number.isFinite(centroid[1]) ? centroid[1] : 0,
    ];

    const tempo: "HOT" | "MODERATE" | "STABLE" = HOT_CODES.has(code)
      ? "HOT"
      : MODERATE_CODES.has(code)
      ? "MODERATE"
      : "STABLE";

    const updateIntervalHours =
      tempo === "HOT" ? 1 : tempo === "MODERATE" ? 3 : 6;

    results.push({
      code,
      numericId: rawId || propName,
      nameTr,
      nameEn,
      officialNameTr,
      capital,
      flagEmoji: customFlag || isoToFlagEmoji(code),
      region: classifyRegion(coords[0], coords[1], code),
      subregion,
      areaKm2,
      currencyCode,
      currencyName,
      currencySymbol,
      languages: languages.slice(0, 3),
      callingCode,
      tempo,
      updateIntervalHours,
      coords,
    });
  }

  results.sort((a, b) => a.nameTr.localeCompare(b.nameTr, "tr"));
  cachedCatalog = results;
  return results;
}

export function getWorldCountryMetaByCode(
  code: string
): WorldCountryMeta | undefined {
  return getAllWorldCountries().find(
    (c) => c.code.toUpperCase() === code.toUpperCase()
  );
}
