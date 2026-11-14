import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const viewer = await getCurrentUser();

    const user = await prisma.user.findUnique({
      where: { username: params.username },
      select: {
        id: true,
        username: true,
        displayName: true,
        title: true,
        bio: true,
        countryCode: true,
        avatarColor: true,
        totalLikes: true,
        weeklyLikes: true,
        followerCount: true,
        followingCount: true,
        globalReachCount: true,
        createdAt: true,
        comments: {
          orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
          take: 25,
          include: {
            agendaItem: {
              include: {
                country: {
                  select: {
                    code: true,
                    nameTr: true,
                    flagEmoji: true,
                  },
                },
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

    let viewerIsFollowing = false;
    if (viewer && viewer.id !== user.id) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewer.id,
            followingId: user.id,
          },
        },
      });
      viewerIsFollowing = Boolean(follow);
    }

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
      (a, b) => b.likes - a.likes || b.commentCount - a.commentCount
    );

    return NextResponse.json({
      user,
      countryInfluence,
      viewerIsFollowing,
      isSelf: Boolean(viewer && viewer.id === user.id),
    });
  } catch (error) {
    console.error("GET /api/users/[username] error:", error);
    return NextResponse.json(
      { error: "Profil bilgileri alınamadı." },
      { status: 500 }
    );
  }
}
