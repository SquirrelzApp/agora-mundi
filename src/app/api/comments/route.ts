import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { moderateComment } from "@/lib/ai-moderator";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        {
          error: "Please sign in to post a comment or reply.",
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      agendaItemId,
      parentId,
      content,
      stanceTag = "COMMENT",
      sourceUrl,
      languageCode = "en",
    } = body;

    if (!agendaItemId || typeof content !== "string") {
      return NextResponse.json(
        { error: "Agenda item and comment text are required." },
        { status: 400 }
      );
    }

    let cleanSourceUrl: string | undefined = undefined;
    if (sourceUrl && typeof sourceUrl === "string" && sourceUrl.trim() !== "") {
      try {
        const parsedUrl = new URL(sourceUrl.trim());
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return NextResponse.json(
            {
              error: "Source link must be a valid http/https URL.",
            },
            { status: 400 }
          );
        }
        cleanSourceUrl = parsedUrl.toString();
      } catch {
        return NextResponse.json(
          { error: "Invalid external source URL format." },
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
        { error: "Agenda item not found." },
        { status: 404 }
      );
    }

    let resolvedParentId: string | null = null;
    let parentExcerpt: string | undefined = undefined;
    if (parentId && typeof parentId === "string") {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
      });
      if (!parentComment || parentComment.agendaItemId !== agendaItemId) {
        return NextResponse.json(
          { error: "Parent comment not found." },
          { status: 404 }
        );
      }
      // Keep reply hierarchy cleanly 1-level nested under the root thread
      resolvedParentId = parentComment.parentId || parentComment.id;
      parentExcerpt = parentComment.content.slice(0, 200);
    }

    const moderation = await moderateComment(
      agendaItem.country.name,
      agendaItem.title,
      content,
      cleanSourceUrl,
      {
        isReply: Boolean(resolvedParentId),
        parentExcerpt,
      }
    );

    if (!moderation.approved) {
      await prisma.moderationLog.create({
        data: {
          username: currentUser.username,
          countryCode: agendaItem.countryCode,
          rejectedContent: content.slice(0, 300),
          violationCategory: moderation.violationCategory,
          reason:
            moderation.reason ||
            "Content violated community guidelines.",
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

    const newComment = await prisma.comment.create({
      data: {
        agendaItemId,
        authorId: currentUser.id,
        parentId: resolvedParentId,
        content: content.trim(),
        sourceUrl: cleanSourceUrl,
        stanceTag,
        languageCode,
        aiQualityScore: moderation.qualityScore,
        likeCount: 0,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            title: true,
            countryCode: true,
            avatarColor: true,
            followerCount: true,
            weeklyLikes: true,
          },
        },
      },
    });

    await prisma.agendaItem.update({
      where: { id: agendaItemId },
      data: { commentCount: { increment: 1 } },
    });

    if (resolvedParentId) {
      await prisma.comment.update({
        where: { id: resolvedParentId },
        data: { replyCount: { increment: 1 } },
      });
    }

    // Update distinct countries where this user has contributed
    const distinctCountries = await prisma.comment.findMany({
      where: { authorId: currentUser.id },
      select: { agendaItem: { select: { countryCode: true } } },
    });
    const uniqueCountrySet = new Set(
      distinctCountries.map((c) => c.agendaItem.countryCode)
    );

    if (uniqueCountrySet.size !== currentUser.globalReachCount) {
      await prisma.user.update({
        where: { id: currentUser.id },
        data: { globalReachCount: uniqueCountrySet.size },
      });
    }

    return NextResponse.json({
      approved: true,
      comment: {
        ...newComment,
        viewerHasLiked: false,
        replies: [],
      },
      moderation,
    });
  } catch (error) {
    console.error("POST /api/comments error:", error);
    return NextResponse.json(
      { error: "Failed to submit comment." },
      { status: 500 }
    );
  }
}
