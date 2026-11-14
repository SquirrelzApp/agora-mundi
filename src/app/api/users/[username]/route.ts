import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const user = await prisma.user.findUnique({
      where: { username: params.username },
      include: {
        comments: {
          orderBy: { likeCount: "desc" },
          include: {
            agendaItem: {
              include: {
                country: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı." },
        { status: 404 }
      );
    }

    // Aggregate likes per country for the user's "Global Influence / Politik CV" breakdown
    const countryBreakdownMap: Record<
      string,
      {
        code: string;
        nameTr: string;
        flagEmoji: string;
        likes: number;
        commentCount: number;
      }
    > = {};

    for (const c of user.comments) {
      const country = c.agendaItem.country;
      if (!countryBreakdownMap[country.code]) {
        countryBreakdownMap[country.code] = {
          code: country.code,
          nameTr: country.nameTr,
          flagEmoji: country.flagEmoji,
          likes: 0,
          commentCount: 0,
        };
      }
      countryBreakdownMap[country.code].likes += c.likeCount;
      countryBreakdownMap[country.code].commentCount += 1;
    }

    const countryInfluence = Object.values(countryBreakdownMap).sort(
      (a, b) => b.likes - a.likes
    );

    return NextResponse.json({
      user,
      countryInfluence,
    });
  } catch (error) {
    console.error("GET /api/users/[username] error:", error);
    return NextResponse.json(
      { error: "Profil bilgileri alınamadı." },
      { status: 500 }
    );
  }
}
