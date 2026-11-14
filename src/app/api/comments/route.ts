import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { moderateComment } from "@/lib/ai-moderator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      agendaItemId,
      authorUsername = "karslioglu_strateji",
      content,
      stanceTag = "ANALIZ",
      sourceUrl,
      languageCode = "tr",
    } = body;

    if (!agendaItemId || typeof content !== "string") {
      return NextResponse.json(
        { error: "Gündem başlığı ve yorum metni zorunludur." },
        { status: 400 }
      );
    }

    // Validate optional external source link (harici link serbest, görsel yasak)
    let cleanSourceUrl: string | undefined = undefined;
    if (sourceUrl && typeof sourceUrl === "string" && sourceUrl.trim() !== "") {
      try {
        const parsedUrl = new URL(sourceUrl.trim());
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return NextResponse.json(
            { error: "Kaynak bağlantısı geçerli bir http/https adresi olmalıdır." },
            { status: 400 }
          );
        }
        cleanSourceUrl = parsedUrl.toString();
      } catch {
        return NextResponse.json(
          { error: "Geçersiz harici kaynak linki formatı." },
          { status: 400 }
        );
      }
    }

    const agendaItem = await prisma.agendaItem.findUnique({
      where: { id: agendaItemId },
      include: { country: true },
    });

    if (!agendaItem) {
      return NextResponse.json(
        { error: "Gündem maddesi bulunamadı." },
        { status: 404 }
      );
    }

    // Run Character Limit + Media Prohibition + AI Moderation Shield
    const moderation = await moderateComment(
      agendaItem.country.nameTr,
      agendaItem.title,
      content,
      cleanSourceUrl
    );

    if (!moderation.approved) {
      await prisma.moderationLog.create({
        data: {
          username: authorUsername,
          countryCode: agendaItem.countryCode,
          rejectedContent: content.slice(0, 300),
          violationCategory: moderation.violationCategory,
          reason:
            moderation.reason ||
            "Platform manifestosuna aykırı içerik tespit edildi.",
        },
      });

      return NextResponse.json(
        {
          approved: false,
          violationCategory: moderation.violationCategory,
          reason: moderation.reason,
        },
        { status: 422 }
      );
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { username: authorUsername },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          username: authorUsername,
          displayName: authorUsername,
          title: "Bağımsız Analist",
          bio: "Sek tartışma ve küresel gündem yorumcusu.",
          countryCode: "TR",
        },
      });
    }

    const newComment = await prisma.comment.create({
      data: {
        agendaItemId,
        authorId: user.id,
        content: content.trim(),
        sourceUrl: cleanSourceUrl,
        stanceTag,
        languageCode,
        aiQualityScore: moderation.qualityScore,
        likeCount: 1,
      },
      include: {
        author: true,
      },
    });

    await prisma.agendaItem.update({
      where: { id: agendaItemId },
      data: { commentCount: { increment: 1 } },
    });

    // Update distinct countries where this user has contributed
    const distinctCountries = await prisma.comment.findMany({
      where: { authorId: user.id },
      select: { agendaItem: { select: { countryCode: true } } },
    });
    const uniqueCountrySet = new Set(
      distinctCountries.map((c) => c.agendaItem.countryCode)
    );

    await prisma.user.update({
      where: { id: user.id },
      data: {
        totalLikes: { increment: 1 },
        weeklyLikes: { increment: 1 },
        globalReachCount: Math.max(user.globalReachCount, uniqueCountrySet.size),
      },
    });

    return NextResponse.json({
      approved: true,
      comment: newComment,
      moderation,
    });
  } catch (error) {
    console.error("POST /api/comments error:", error);
    return NextResponse.json(
      { error: "Yorum gönderilirken bir hata oluştu." },
      { status: 500 }
    );
  }
}
