import { PrismaClient } from "@prisma/client";
import { getAllWorldCountries } from "../src/lib/world-countries";

const prisma = new PrismaClient();

const CUSTOM_AGENDAS: Record<string, [string, string, string]> = {
  TR: [
    "Türkiye bürokratların da içinde olduğu fon vurgunuyla çalkalanıyor",
    "Türkiye'de genel seçimler yaklaşmakta",
    "Ülkede orman yangınları baş gösteriyor",
  ],
  IL: [
    "Kuzey sınırında askeri hareketlilik ve yedek birlik sevkiyatı hızlandı",
    "Savaş kabinesinde ateşkes ve rehine takası şartları üzerine sert çatlak oluştu",
    "Savunma bütçesi artışı nedeniyle kemer sıkma paketi meclis gündeminde",
  ],
  FI: [
    "Doğu sınırı güvenlik duvarı ve NATO entegrasyon tatbikatları sürüyor",
    "Eğitim sisteminde dijital ekran süresinin azaltılıp basılı kitaplara dönüş tartışılıyor",
    "Yeni nesil küçük modüler nükleer reaktör yatırımları belediyelerin gündeminde",
  ],
  IS: [
    "Reykjanes yarımadasındaki volkanik hareketlilik nedeniyle jeotermal hatlar güçlendiriliyor",
    "Balıkçılık kotalarının sürdürülebilirlik kapsamında daraltılması tartışılıyor",
    "Ülkede 4 günlük çalışma haftası uygulamasının uzun vadeli verimlilik sonuçları değerlendiriliyor",
  ],
  US: [
    "Kongre'de federal borç tavanı ve sınır güvenliği bütçesi krizi derinleşiyor",
    "Yapay zeka tekellerine yönelik federal antitröst davaları teknoloji devlerini sarsıyor",
    "Fed'in faiz politikası ve sanayi eyaletlerindeki istihdam verileri piyasaları geriyor",
  ],
  DE: [
    "Otomotiv devlerinin fabrika kapatma planları sanayi sendikalarını ayağa kaldırdı",
    "Koalisyon hükümetinde bütçe açığı ve enerji sübvansiyonları krizi yaşanıyor",
    "Nitelikli göçmen yasası ve sınır kontrollerinin sıkılaştırılması tartışılıyor",
  ],
  RU: [
    "Savunma sanayii üretimi ekonominin ana motoru haline gelirken enflasyon baskısı artıyor",
    "Alternatif doğu enerji boru hatları ve yeni ticaret koridorları için diplomasi yürütülüyor",
    "Merkez Bankası rubleyi korumak için sıkı sermaye kontrollerini uzatmayı tartışıyor",
  ],
  GB: [
    "Ulusal Sağlık Sistemi'ndeki (NHS) bekleme süreleri ve doktor grevleri siyaseti kilitledi",
    "Londra finans merkezinin rekabet gücünü artırmak için yeni regülasyon esnemeleri tartışılıyor",
    "Konut kiralarındaki rekor artış genç seçmenleri radikal imar reformu taleplerine yöneltiyor",
  ],
  JP: [
    "Demografik küçülme ve kırsaldaki boş ev krizi için radikal teşvik paketi hazırlandı",
    "Yen'deki dalgalanma sonrası Merkez Bankası'nın para politikası normalleşme süreci izleniyor",
    "Yarı iletken üretim üssü olma hedefiyle güney adalarında dev çip fabrikaları kuruluyor",
  ],
  BR: [
    "Amazon havzasında kaçak madencilikle mücadele ve tarım lobisi arasındaki gerilim tırmanıyor",
    "BRICS kapsamında yerel para birimleriyle ikili ticaret anlaşmaları genişletiliyor",
    "Vergi reformu paketi eyalet valileri ile federal hükümeti karşı karşıya getirdi",
  ],
  AZ: [
    "Zengezur koridoru ve bölgesel ulaşım hatlarının açılması için diplomasi trafiği hızlandı",
    "Karabağ bölgesinde altyapı, akıllı şehir ve tarımsal dönüşüm yatırımları sürüyor",
    "Avrupa'ya doğalgaz ve yeşil enerji ihracat kapasitesinin artırılması gündemde",
  ],
  FR: [
    "Ulusal Meclis'te bütçe açığını düşürmeye yönelik vergi ve emeklilik düzenlemeleri tartışılıyor",
    "Nükleer enerji filosu modernizasyonu ve sanayi elektriği tarifeleri kamuoyunun gündeminde",
    "Tarım sektöründe AB regülasyonlarına karşı çiftçi sendikalarının protestoları sürüyor",
  ],
  UA: [
    "Cephe hattında insansız hava aracı üretimi ve enerji altyapısını koruma seferberliği sürüyor",
    "Batılı müttefiklerden gelecek uzun vadeli mali ve askeri yardım paketlerinin şartları tartışılıyor",
    "Savaş ekonomisi koşullarında kamu bütçesi ve yeniden inşa fonlarının yönetimi gündemde",
  ],
  CN: [
    "Yüksek teknoloji ve elektrikli araç ihracatına yönelik Batı tarifelerine karşı yeni ticaret adımları atılıyor",
    "Gayrimenkul sektöründeki borç yapılandırması ve iç tüketimi canlandırma teşvikleri gündemde",
    "Yerli çip ve yapay zeka altyapısında tam bağımsızlık yatırımları hız kazandı",
  ],
  IR: [
    "Bölgesel jeopolitik gerilimler ve yaptırımların enerji ihracatına etkisi tartışılıyor",
    "Döviz kuru dalgalanmaları ve enflasyon karşısında yeni ekonomik paket arayışı sürüyor",
    "Su kaynakları yönetimi ve büyükşehirlerdeki altyapı yatırımları meclis gündeminde",
  ],
  GR: [
    "Turizm gelirlerindeki artışa rağmen büyükşehirlerdeki konut ve yaşam maliyeti krizi tartışılıyor",
    "Ege ve Doğu Akdeniz'de deniz yetki alanları ve enerji hatları diplomasisi izleniyor",
    "Kamu borcunun azaltılması sonrası yeni sanayi ve liman yatırımları gündemde",
  ],
};

async function main() {
  const allWorldCountries = getAllWorldCountries();
  console.log(
    `Seeding Agora Mundi with ${allWorldCountries.length} world countries...`
  );

  await prisma.vote.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.agendaItem.deleteMany();
  await prisma.country.deleteMany();
  await prisma.user.deleteMany();
  await prisma.moderationLog.deleteMany();

  // 1. Create Users
  const usersData = [
    {
      id: "user-1",
      username: "karslioglu_strateji",
      displayName: "Batın Karslıoğlu",
      title: "Jeopolitik & Kamu Politikaları Teorisyeni",
      bio: "Popülizmden uzak, rasyonel devlet aklı ve küresel güç dengeleri üzerine sek analizler. Rakamlar ve tarihsel süreklilik konuşur.",
      countryCode: "TR",
      totalLikes: 1840,
      weeklyLikes: 642,
      followerCount: 1290,
      globalReachCount: 7,
    },
    {
      id: "user-2",
      username: "ankara_perspektif",
      displayName: "Dr. Selim Arslan",
      title: "Makroekonomi & Kurumsal Reform Uzmanı",
      bio: "Bürokrasi, mali şeffaflık ve seçim ekonomisi modelleri. Kısa vadeli heyecanlar değil, yapısal kurumlar ülkeleri ayakta tutar.",
      countryCode: "TR",
      totalLikes: 1520,
      weeklyLikes: 518,
      followerCount: 980,
      globalReachCount: 5,
    },
    {
      id: "user-3",
      username: "nordic_realist",
      displayName: "Mikko Virtanen",
      title: "Kuzey Avrupa Güvenlik ve Enerji Analisti",
      bio: "Focusing on Baltic security architecture, nuclear energy realism, and educational standards in post-industrial societies.",
      countryCode: "FI",
      totalLikes: 1190,
      weeklyLikes: 410,
      followerCount: 760,
      globalReachCount: 6,
    },
    {
      id: "user-4",
      username: "levant_observer",
      displayName: "Nadav & Tariq Desk",
      title: "Doğu Akdeniz Kriz & Diplomasi Gözlemcisi",
      bio: "Sıcak çatışma bölgelerinde askeri lojistik, iç politik koalisyon dengeleri ve diplomasi koridorları üzerine soğukkanlı notlar.",
      countryCode: "IL",
      totalLikes: 1410,
      weeklyLikes: 489,
      followerCount: 845,
      globalReachCount: 6,
    },
    {
      id: "user-5",
      username: "reikjavik_ethos",
      displayName: "Sigríður Jónsdóttir",
      title: "Sürdürülebilir Ekonomi & Çalışma Sosyoloğu",
      bio: "Resource economics, geothermal resilience, and labor productivity in small high-trust democracies.",
      countryCode: "IS",
      totalLikes: 890,
      weeklyLikes: 295,
      followerCount: 540,
      globalReachCount: 4,
    },
    {
      id: "user-6",
      username: "rhein_industrie",
      displayName: "Lukas Weber",
      title: "Avrupa Sanayi ve Enerji Politikaları",
      bio: "Analyzing Central European deindustrialization risks, automotive transformation, and fiscal discipline.",
      countryCode: "DE",
      totalLikes: 970,
      weeklyLikes: 334,
      followerCount: 615,
      globalReachCount: 5,
    },
  ];

  await prisma.user.createMany({ data: usersData });

  // 2. Bulk create all ~175 World Countries
  await prisma.country.createMany({
    data: allWorldCountries.map((c) => ({
      code: c.code,
      nameTr: c.nameTr,
      region: c.region,
      flagEmoji: c.flagEmoji,
      tempo: c.tempo,
      updateIntervalHours: c.updateIntervalHours,
      mapX: c.coords[0],
      mapY: c.coords[1],
    })),
  });

  // 3. Create A, B, C agendas for all World Countries
  const agendaRows: Array<{
    id: string;
    countryCode: string;
    slot: string;
    title: string;
    isActive: boolean;
  }> = [];

  for (const c of allWorldCountries) {
    const custom = CUSTOM_AGENDAS[c.code];
    const titles: [string, string, string] = custom || [
      `${c.nameTr} kamuoyunda enflasyon, yaşam maliyeti ve yeni ekonomi paketi tartışılıyor`,
      `${c.nameTr} iç siyasetinde hükümet politikaları ve yaklaşan seçim dengeleri gündemde`,
      `${c.nameTr} genelinde enerji güvenliği, altyapı yatırımları ve bölgesel ticaret konuşuluyor`,
    ];

    const slots = ["A", "B", "C"] as const;
    slots.forEach((slot, idx) => {
      agendaRows.push({
        id: `agenda_${c.code}_${slot}`,
        countryCode: c.code,
        slot,
        title: titles[idx],
        isActive: true,
      });
    });
  }

  await prisma.agendaItem.createMany({ data: agendaRows });

  // 4. Seed Analytical Comments
  const commentsData = [
    {
      agendaKey: "TR_B",
      authorId: "user-1",
      stanceTag: "TEZ",
      languageCode: "tr",
      likeCount: 342,
      aiQualityScore: 96,
      sourceUrl: "https://www.ysk.gov.tr",
      content:
        "Yaklaşan genel seçimlerde geleneksel kimlik siyaseti ilk kez seçmenin mutfak gerçekliği ve kurumsal liyakat talebinin gerisine düşmüş durumda. Hangi ittifak olursa olsun; soyut ideolojik vaatler yerine ilk 100 günde Merkez Bankası bağımsızlığı, kamu ihale şeffaflığı ve tarımsal arz güvenliği için somut takvim sunan kadrolar kitleleri peşinden sürükleyecektir. Artık sloganların değil, teknokratik güvenin iktidar belirleyeceği bir eşikteyiz.",
    },
    {
      agendaKey: "TR_B",
      authorId: "user-2",
      stanceTag: "ANALIZ",
      languageCode: "tr",
      likeCount: 215,
      aiQualityScore: 93,
      content:
        "Seçim takvimi yaklaştıkça kamu harcamalarında yaşanabilecek olası bir gevşeme, son iki yılda ödenen dezenflasyon maliyetini sıfırlama riski taşıyor. Seçmen davranışını incelediğimizde kararsız seçmenin kısa vadeli popülist nakit transferlerinden ziyade, konut erişimi ve vergi adaleti konusunda kalıcı bir reform beklediğini görüyoruz.",
    },
    {
      agendaKey: "TR_A",
      authorId: "user-2",
      stanceTag: "COZUM",
      languageCode: "tr",
      likeCount: 289,
      aiQualityScore: 95,
      sourceUrl: "https://www.spk.gov.tr",
      content:
        "Bürokratların da adının karıştığı fon vurgunu vakası, sadece bireysel bir suistimal değil; denetim mekanizmalarındaki çıkar çatışmasının sonucudur. Çözüm nettir: Kamu görevlilerinin ve birinci derece yakınlarının özel fon hareketleri blokzincir tabanlı açık sicil sistemine bağlanmalı ve bağımsız denetim kurullarının atama usulü yürütmeden tamamen ayrıştırılmalıdır.",
    },
    {
      agendaKey: "TR_C",
      authorId: "user-1",
      stanceTag: "ELESTIRI",
      languageCode: "tr",
      likeCount: 178,
      aiQualityScore: 91,
      content:
        "Her yaz tekrarlanan orman yangınlarını sadece iklim krizi veya anlık sabotaj başlığına sıkıştırmak stratejik körlüktür. Yangın söndürme filosunun yerel belediyeler ve sivil inisiyatiflerle entegre edilmemesi, erken uyarı İHA verilerinin yerel müdahale ekiplerine saniyeler içinde aktarılamaması asıl yönetim zafiyetidir.",
    },
    {
      agendaKey: "FI_B",
      authorId: "user-3",
      stanceTag: "ANALIZ",
      languageCode: "en",
      likeCount: 194,
      aiQualityScore: 94,
      sourceUrl: "https://www.oph.fi/en",
      content:
        "Finland's decision to reconsider heavy classroom digitization and return to physical textbooks is a crucial lesson for the entire world. Cognitive studies over the last decade clearly show that deep reading comprehension and long-form analytical thinking decline when primary education relies on tablets. True modernization is knowing when low-tech produces superior minds.",
    },
    {
      agendaKey: "FI_B",
      authorId: "user-1",
      stanceTag: "TEZ",
      languageCode: "tr",
      likeCount: 162,
      aiQualityScore: 92,
      content:
        "Finlandiya'nın eğitimde tabletten basılı kitaba geri dönüş tartışması, gelişmekte olan ülkelerdeki 'her öğrenciye tablet dağıtarak eğitimi kurtarma' yanılgısına en ağır cevaptır. Odaklanma süresi parçalanmış bir nesil derin strateji üretemez; kağıt ve kalemle kurulan zihinsel disiplin, gelecekte bir ülkenin en büyük rekabet üstünlüğü olacaktır.",
    },
    {
      agendaKey: "IS_C",
      authorId: "user-5",
      stanceTag: "ANALIZ",
      languageCode: "en",
      likeCount: 148,
      aiQualityScore: 90,
      content:
        "Iceland's four-day workweek trials succeeded not because people worked less, but because organizations eliminated performative meetings and bureaucratic friction. Countries attempting to copy this model without first building high-trust workplace autonomy will face productivity shocks.",
    },
    {
      agendaKey: "IL_B",
      authorId: "user-4",
      stanceTag: "ANALIZ",
      languageCode: "tr",
      likeCount: 231,
      aiQualityScore: 94,
      content:
        "Savaş kabinesindeki ateşkes çatlağı, askeri hedefler ile diplomatik gerçeklik arasındaki makasın artık kapanamaz noktaya geldiğini gösteriyor. Uzun süreli yedek asker seferberliği ülke içindeki yüksek teknoloji ve finans sektöründe ciddi işgücü kaybı yaratırken, siyasi kanadın savaşı uzatma eğilimi genelkurmay rasyonalitesiyle doğrudan çarpışıyor.",
    },
    {
      agendaKey: "DE_A",
      authorId: "user-6",
      stanceTag: "ANALIZ",
      languageCode: "en",
      likeCount: 185,
      aiQualityScore: 93,
      content:
        "The crisis in German automotive manufacturing is the inevitable outcome of high industrial energy prices combined with delayed software architecture transition. Subsidizing legacy factories without solving structural electricity costs will only postpone the reckoning.",
    },
    {
      agendaKey: "US_B",
      authorId: "user-1",
      stanceTag: "TEZ",
      languageCode: "tr",
      likeCount: 154,
      aiQualityScore: 92,
      content:
        "ABD Adalet Bakanlığı'nın yapay zeka ve bulut tekellerine açtığı antitröst davaları, 20. yüzyılın başındaki standart petrol (Standard Oil) bölünmesi kadar tarihi bir kırılmadır. Hesaplama gücünü (compute) elinde tutan 3 şirketin küresel bilgi akışını tekelleştirmesi serbest piyasa değil, dijital feodalizmdir.",
    },
  ];

  for (const c of commentsData) {
    const agendaItemId = `agenda_${c.agendaKey}`;
    await prisma.comment.create({
      data: {
        agendaItemId,
        authorId: c.authorId,
        stanceTag: c.stanceTag,
        languageCode: c.languageCode,
        likeCount: c.likeCount,
        aiQualityScore: c.aiQualityScore,
        sourceUrl: c.sourceUrl,
        content: c.content,
      },
    });

    await prisma.agendaItem.update({
      where: { id: agendaItemId },
      data: { commentCount: { increment: 1 } },
    });
  }

  await prisma.moderationLog.createMany({
    data: [
      {
        username: "anon_troll_99",
        countryCode: "TR",
        rejectedContent: "Bunların hepsi hırsız alayının Allah belasını versin...",
        violationCategory: "PROFANITY",
        reason: "Argüman içermeyen hakaret ve beddua dili tespit edildi.",
      },
      {
        username: "rage_poster",
        countryCode: "DE",
        rejectedContent: "All immigrants from that region are subhuman parasites...",
        violationCategory: "RACISM_HATE",
        reason: "Etnik/ırkçı nefret söylemi ve insanlık onuruna saldırı tespit edildi.",
      },
    ],
  });

  console.log(`Seeded ${allWorldCountries.length} countries and agendas!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
