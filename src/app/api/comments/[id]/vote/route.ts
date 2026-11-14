import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const commentId = params.id;

    const comment = await prisma.comment.update({
      where: { id: commentId },
      data: { likeCount: { increment: 1 } },
      include: { author: true },
    });

    await prisma.user.update({
      where: { id: comment.authorId },
      data: {
        totalLikes: { increment: 1 },
        weeklyLikes: { increment: 1 },
      },
    });

    return NextResponse.json({ comment });
  } catch (error) {
    console.error("POST /api/comments/[id]/vote error:", error);
    return NextResponse.json(
      { error: "Beğeni kaydedilemedi." },
      { status: 500 }
    );
  }
}
