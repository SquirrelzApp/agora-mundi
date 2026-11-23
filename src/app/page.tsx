import { cookies, headers } from "next/headers";
import GlobeTakeApp from "@/components/GlobeTakeApp";
import { detectVisitorLocale } from "@/lib/geo-language";
import { normalizeLanguageCode } from "@/lib/language-config";

export const dynamic = "force-dynamic";

export default async function AgoraMundiPage() {
  const reqHeaders = headers();
  const cookieStore = cookies();

  const detected = await detectVisitorLocale(reqHeaders);
  const manualCookie = cookieStore.get("globetake_lang")?.value;
  const hasManualOverride =
    typeof manualCookie === "string" &&
    manualCookie.trim().length > 0 &&
    manualCookie.trim().toLowerCase() !== "auto";

  const activeLang = hasManualOverride
    ? normalizeLanguageCode(manualCookie)
    : detected.lang;

  return (
    <GlobeTakeApp
      initialLocale={{
        lang: activeLang,
        detectedLang: detected.lang,
        countryCode: detected.countryCode,
        source: detected.source,
        isAuto: !hasManualOverride,
      }}
    />
  );
}
