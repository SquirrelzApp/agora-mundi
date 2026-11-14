import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        {
          error: "Beğeni yapmak için giriş yapmalısınız.",
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    const commentId = params.id;
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return NextResponse.json(
        { error: "Yorum bulunamadı." },
        { status: 404 }
      );
    }

    const existingVote = await prisma.vote.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId: currentUser.id,
        },
      },
    });

    if (existingVote) {
      await prisma.vote.delete({ where: { id: existingVote.id } });
      const nextLikes = Math.max(0, comment.likeCount - 1);
      const updated = await prisma.comment.update({
        where: { id: commentId },
        data: { likeCount: nextLikes },
      });

      const author = await prisma.user.findUnique({
        where: { id: comment.authorId },
      });
      if (author) {
        await prisma.user.update({
          where: { id: author.id },
          data: {
            totalLikes: Math.max(0, author.totalLikes - 1),
            weeklyLikes: Math.max(0, author.weeklyLikes - 1),
          },
        });
      }

      return NextResponse.json({
        liked: false,
        likeCount: updated.likeCount,
      });
    } else {
      await prisma.vote.create({
        data: {
          commentId,
          userId: currentUser.id,
        },
      });
      const updated = await prisma.comment.update({
        where: { id: commentId },
        data: { likeCount: { increment: 1 } },
      });

      await prisma.user.update({
        where: { id: comment.authorId },
        data: {
          totalLikes: { increment: 1 },
          weeklyLikes: { increment: 1 },
        },
      });

      return NextResponse.json({
        liked: true,
        likeCount: updated.likeCount,
      });
    }
  } catch (error) {
    console.error("POST /api/comments/[id]/vote error:", error);
    return NextResponse.json(
      { error: "Beğeni işlemi başarısız oldu." },
      { status: 500 }
    );
  }
}
