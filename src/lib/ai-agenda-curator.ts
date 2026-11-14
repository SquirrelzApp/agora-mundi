import { GoogleGenAI } from "@google/genai";

const AUTONOMOUS_ROTATION_POOL: Record<string, string[][]> = {
  TR: [
    [
      "Türkiye bürokratların da içinde olduğu fon vurgunuyla çalkalanıyor",
      "Türkiye'de genel seçimler yaklaşmakta",
      "Ülkede orman yangınları baş gösteriyor",
    ],
    [
      "Merkez Bankası'nın faiz kararı ve enflasyonla mücadele programı tartışılıyor",
      "Büyükşehirlerde kentsel dönüşüm ve deprem hazırlık bütçeleri gündemde",
      "Eğitim müfredatındaki köklü değişiklikler kamuoyunda tartışma yarattı",
    ],
  ],
  IL: [
    [
      "Kuzey sınırında askeri hareketlilik ve yedek birlik sevkiyatı hızlandı",
      "Savaş kabinesinde ateşkes ve rehine takası şartları üzerine sert çatlak oluştu",
      "Savunma bütçesi artışı nedeniyle kemer sıkma paketi meclis gündeminde",
    ],
    [
      "Yüksek Mahkeme'nin zorunlu askerlik muafiyeti kararı koalisyonu sarsıyor",
      "Doğu Akdeniz enerji hatları güvenliği için donanma devriyeleri artırıldı",
      "Teknoloji sektöründeki sermaye çıkışı nedeniyle acil teşvik paketi tartışılıyor",
    ],
  ],
  FI: [
    [
      "Doğu sınırı güvenlik duvarı ve NATO entegrasyon tatbikatları sürüyor",
      "Eğitim sisteminde dijital ekran süresinin azaltılıp basılı kitaplara dönüş tartışılıyor",
      "Yeni nesil küçük modüler nükleer reaktör yatırımları belediyelerin gündeminde",
    ],
  ],
  IS: [
    [
      "Reykjanes yarımadasındaki volkanik hareketlilik nedeniyle jeotermal hatlar güçlendiriliyor",
      "Balıkçılık kotalarının sürdürülebilirlik kapsamında daraltılması tartışılıyor",
      "Ülkede 4 günlük çalışma haftası uygulamasının uzun vadeli verimlilik sonuçları değerlendiriliyor",
    ],
  ],
};

/**
 * Tam Otonom A-B-C Gündem Motoru (Admin Onayı Yok)
 * Ülkenin gündem hızına göre en güncel 3 olayı basın dili kullanmadan tek cümleyle çeker.
 */
export async function generateAutonomousCountryAgendas(
  countryCode: string,
  countryNameTr: string,
  currentTitles: string[]
): Promise<[string, string, string]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const interaction = await ai.interactions.create({
        model: "gemini-4-argon",
        tools: [{ type: "google_search" }],
        generation_config: {
          thinking_level: "low",
        },
        system_instruction: `Verilen ülke için şu an kamuoyuna yansımış en güncel ve en çok tartışılan 3 gündem maddesini bul.
Kurallar:
- Basın veya resmi haber bülteni dili KULLANMA.
- Her madde tek cümlelik, yalın ve doğrudan bir durum tespiti olsun.
- Örnek format:
  A: Türkiye bürokratların da içinde olduğu fon vurgunuyla çalkalanıyor
  B: Türkiye'de genel seçimler yaklaşmakta
  C: Ülkede orman yangınları baş gösteriyor`,
        input: `${countryNameTr} (${countryCode}) için şu anki en güncel 3 gündem maddesini Türkçe ve tek cümlelik A, B, C başlıkları olarak çıkar.`,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: {
              slotA: { type: "string" },
              slotB: { type: "string" },
              slotC: { type: "string" },
            },
            required: ["slotA", "slotB", "slotC"],
          },
        },
      });

      if (interaction.output_text) {
        const parsed = JSON.parse(interaction.output_text);
        if (parsed.slotA && parsed.slotB && parsed.slotC) {
          return [parsed.slotA, parsed.slotB, parsed.slotC];
        }
      }
    } catch (err) {
      console.warn("Autonomous agenda fallback used:", err);
    }
  }

  const pool = AUTONOMOUS_ROTATION_POOL[countryCode];
  if (pool && pool.length > 1) {
    const isFirstActive = currentTitles[0] === pool[0][0];
    const nextSet = isFirstActive ? pool[1] : pool[0];
    return [nextSet[0], nextSet[1], nextSet[2]];
  }

  return [
    currentTitles[0] || `${countryNameTr} kamuoyunda ekonomik reform paketi tartışılıyor`,
    currentTitles[1] || `${countryNameTr} iç siyasetinde seçim ve koalisyon dengeleri gündemde`,
    currentTitles[2] || `${countryNameTr} genelinde enerji ve altyapı yatırımları konuşuluyor`,
  ];
}
