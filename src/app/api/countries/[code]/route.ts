import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueBackgroundCountrySync } from "@/lib/news-scheduler";
import { getCurrentUser } from "@/lib/auth";
import {
  ensureAgendaTranslations,
  getCachedAgendaTranslations,
} from "@/lib/agenda-translator";
import { normalizeLanguageCode } from "@/lib/language-config";
import { getClientIp } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = params.code.toUpperCase();
    const sort = request.nextUrl.searchParams.get("sort") || "likes";
    const requestedAgendaId =
      request.nextUrl.searchParams.get("agendaId")?.trim() || null;
    const targetLang = normalizeLanguageCode(
      request.nextUrl.searchParams.get("lang") ||
        request.cookies.get("globetake_lang")?.value ||
        "en"
    );

    const viewer = await getCurrentUser();

    const commentsInclude = {
      where: { parentId: null },
      orderBy:
        sort === "recent"
          ? { createdAt: "desc" as const }
          : [{ likeCount: "desc" as const }, { createdAt: "desc" as const }],
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
        replies: {
          orderBy: { createdAt: "asc" as const },
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
        },
      },
    };

    // Instant database read; background scheduler keeps source feeds fresh.
    const country = await prisma.country.findUnique({
      where: { code },
      include: {
        agendas: {
          where: { isActive: true },
          orderBy: { slot: "asc" },
          include: {
            comments: commentsInclude,
          },
        },
      },
    });

    if (!country) {
      return NextResponse.json({ error: "Country not found." }, { status: 404 });
    }

    if (
      requestedAgendaId &&
      !country.agendas.some((ag) => ag.id === requestedAgendaId)
    ) {
      const requestedAgenda = await prisma.agendaItem.findFirst({
        where: { id: requestedAgendaId, countryCode: code },
        include: {
          comments: commentsInclude,
        },
      });
      if (requestedAgenda) {
        country.agendas.unshift(requestedAgenda);
      }
    }

    if (country.agendas.length === 0) {
      enqueueBackgroundCountrySync(code);
    }

    // Resolve viewer's liked comment IDs and followed author IDs
    const likedSet = new Set<string>();
    const followedSet = new Set<string>();

    if (viewer) {
      const allCommentIds: string[] = [];
      const allAuthorIds = new Set<string>();

      for (const ag of country.agendas) {
        for (const c of ag.comments) {
          allCommentIds.push(c.id);
          allAuthorIds.add(c.authorId);
          for (const r of c.replies) {
            allCommentIds.push(r.id);
            allAuthorIds.add(r.authorId);
          }
        }
      }

      if (allCommentIds.length > 0) {
        const votes = await prisma.vote.findMany({
          where: {
            userId: viewer.id,
            commentId: { in: allCommentIds },
          },
          select: { commentId: true },
        });
        for (const v of votes) likedSet.add(v.commentId);
      }

      if (allAuthorIds.size > 0) {
        const follows = await prisma.follow.findMany({
          where: {
            followerId: viewer.id,
            followingId: { in: Array.from(allAuthorIds) },
          },
          select: { followingId: true },
        });
        for (const f of follows) followedSet.add(f.followingId);
      }
    }

    const archivedAgendasRaw = await prisma.agendaItem.findMany({
      where: { countryCode: code, isActive: false },
      orderBy: { archivedAt: "desc" },
      take: 6,
      select: {
        id: true,
        slot: true,
        title: true,
        category: true,
        commentCount: true,
        archivedAt: true,
      },
    });

    const clientIp = getClientIp(request);
    const [activeTranslations, archivedTranslations] = await Promise.all([
      ensureAgendaTranslations(
        country.agendas.map((ag) => ({
          id: ag.id,
          title: ag.title,
          summary: ag.summary,
        })),
        targetLang,
        { rateLimitKey: `agenda-tr:${clientIp}` }
      ),
      getCachedAgendaTranslations(
        archivedAgendasRaw.map((ag) => ag.id),
        targetLang
      ),
    ]);

    const archivedAgendas = archivedAgendasRaw.map((ag) => {
      const tr = archivedTranslations.get(ag.id);
      return tr ? { ...ag, title: tr.title } : ag;
    });

    const formattedCountry = {
      ...country,
      languages: safeParseJson<string[]>(country.languagesJson, []),
      agendas: country.agendas.map((ag) => {
        const tr = activeTranslations.get(ag.id);
        return {
          id: ag.id,
          slot: ag.slot,
          title: tr?.title ?? ag.title,
          summary: tr?.summary ?? ag.summary,
          category: ag.category,
          sourceOrigin: ag.sourceOrigin,
          publishedAt: ag.publishedAt,
          commentCount: ag.commentCount,
          sources: safeParseJson<
            Array<{
              title: string;
              publisher: string;
              url: string;
              publishedAt: string;
            }>
          >(ag.sourcesJson, []),
          comments: ag.comments.map((c) => ({
            ...c,
            viewerHasLiked: likedSet.has(c.id),
            author: {
              ...c.author,
              viewerIsFollowing: followedSet.has(c.author.id),
            },
            replies: c.replies.map((r) => ({
              ...r,
              viewerHasLiked: likedSet.has(r.id),
              author: {
                ...r.author,
                viewerIsFollowing: followedSet.has(r.author.id),
              },
            })),
          })),
        };
      }),
    };

    return NextResponse.json({
      country: formattedCountry,
      archivedAgendas,
      lang: targetLang,
    });
  } catch (error) {
    console.error("GET /api/countries/[code] error:", error);
    return NextResponse.json(
      { error: "Failed to load country details." },
      { status: 500 }
    );
  }
}
