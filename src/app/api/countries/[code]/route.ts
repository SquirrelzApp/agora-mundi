import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = params.code.toUpperCase();
    const sort = request.nextUrl.searchParams.get("sort") || "likes";

    const country = await prisma.country.findUnique({
      where: { code },
      include: {
        agendas: {
          where: { isActive: true },
          orderBy: { slot: "asc" },
          include: {
            comments: {
              orderBy:
                sort === "recent"
                  ? { createdAt: "desc" }
                  : { likeCount: "desc" },
              include: {
                author: true,
              },
            },
          },
        },
      },
    });

    if (!country) {
      return NextResponse.json({ error: "Ülke bulunamadı." }, { status: 404 });
    }

    const archivedAgendas = await prisma.agendaItem.findMany({
      where: { countryCode: code, isActive: false },
      orderBy: { archivedAt: "desc" },
      take: 6,
    });

    return NextResponse.json({ country, archivedAgendas });
  } catch (error) {
    console.error("GET /api/countries/[code] error:", error);
    return NextResponse.json(
      { error: "Ülke detayları alınamadı." },
      { status: 500 }
    );
  }
}
