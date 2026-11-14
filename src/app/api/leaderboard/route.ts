import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const weeklyLeaders = await prisma.user.findMany({
      orderBy: { weeklyLikes: "desc" },
      take: 6,
    });

    const mostFollowed = await prisma.user.findMany({
      orderBy: { followerCount: "desc" },
      take: 6,
    });

    const globalStrategists = await prisma.user.findMany({
      orderBy: [{ globalReachCount: "desc" }, { totalLikes: "desc" }],
      take: 6,
    });

    const topTheses = await prisma.comment.findMany({
      orderBy: { likeCount: "desc" },
      take: 5,
      include: {
        author: true,
        agendaItem: {
          include: {
            country: true,
          },
        },
      },
    });

    const recentRejections = await prisma.moderationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
    });

    const totalComments = await prisma.comment.count();
    const totalRejections = await prisma.moderationLog.count();

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
      { error: "Liderlik tablosu alınamadı." },
      { status: 500 }
    );
  }
}
