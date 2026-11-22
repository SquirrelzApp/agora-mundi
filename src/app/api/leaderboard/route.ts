import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  title: true,
  countryCode: true,
  avatarColor: true,
  totalLikes: true,
  weeklyLikes: true,
  followerCount: true,
  globalReachCount: true,
};

export async function GET() {
  try {
    const [
      weeklyLeaders,
      mostFollowed,
      globalStrategists,
      topTheses,
      recentRejections,
      totalComments,
      totalRejections,
    ] = await Promise.all([
      prisma.user.findMany({
        select: PUBLIC_USER_SELECT,
        orderBy: [{ weeklyLikes: "desc" }, { globalReachCount: "desc" }],
        take: 6,
      }),
      prisma.user.findMany({
        select: PUBLIC_USER_SELECT,
        orderBy: [{ followerCount: "desc" }, { totalLikes: "desc" }],
        take: 6,
      }),
      prisma.user.findMany({
        select: PUBLIC_USER_SELECT,
        orderBy: [{ globalReachCount: "desc" }, { totalLikes: "desc" }],
        take: 6,
      }),
      prisma.comment.findMany({
        where: { parentId: null },
        orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
        take: 5,
        include: {
          author: { select: PUBLIC_USER_SELECT },
          agendaItem: {
            include: {
              country: {
                select: {
                  code: true,
                  name: true,
                  flagEmoji: true,
                },
              },
            },
          },
        },
      }),
      prisma.moderationLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.comment.count(),
      prisma.moderationLog.count(),
    ]);

    return NextResponse.json({
      weeklyLeaders,
      mostFollowed,
      globalStrategists,
      topTheses,
      moderationStats: {
        totalApprovedComments: totalComments,
        totalRejectedComments: totalRejections,
        recentRejections,
      },
    });
  } catch (error) {
    console.error("GET /api/leaderboard error:", error);
    return NextResponse.json(
      { error: "Failed to load leaderboard." },
      { status: 500 }
    );
  }
}
