import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  _request: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const viewer = await getCurrentUser();
    if (!viewer) {
      return NextResponse.json(
        {
          error: "Please sign in to follow users.",
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { username: params.username },
    });

    if (!target) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    if (target.id === viewer.id) {
      return NextResponse.json(
        { error: "You cannot follow yourself." },
        { status: 400 }
      );
    }

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewer.id,
          followingId: target.id,
        },
      },
    });

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
      const updatedTarget = await prisma.user.update({
        where: { id: target.id },
        data: { followerCount: Math.max(0, target.followerCount - 1) },
      });
      await prisma.user.update({
        where: { id: viewer.id },
        data: { followingCount: Math.max(0, viewer.followingCount - 1) },
      });

      return NextResponse.json({
        following: false,
        followerCount: updatedTarget.followerCount,
      });
    } else {
      await prisma.follow.create({
        data: {
          followerId: viewer.id,
          followingId: target.id,
        },
      });
      const updatedTarget = await prisma.user.update({
        where: { id: target.id },
        data: { followerCount: { increment: 1 } },
      });
      await prisma.user.update({
        where: { id: viewer.id },
        data: { followingCount: { increment: 1 } },
      });

      return NextResponse.json({
        following: true,
        followerCount: updatedTarget.followerCount,
      });
    }
  } catch (error) {
    console.error("POST /api/users/[username]/follow error:", error);
    return NextResponse.json(
      { error: "Failed to toggle follow." },
      { status: 500 }
    );
  }
}
