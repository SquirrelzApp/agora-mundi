import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const countries = await prisma.country.findMany({
      include: {
        agendas: {
          where: { isActive: true },
          orderBy: { slot: "asc" },
          include: {
            _count: {
              select: { comments: true },
            },
          },
        },
      },
      orderBy: { nameTr: "asc" },
    });

    return NextResponse.json({ countries });
  } catch (error) {
    console.error("GET /api/countries error:", error);
    return NextResponse.json(
      { error: "Ülke gündemleri yüklenemedi." },
      { status: 500 }
    );
  }
}
