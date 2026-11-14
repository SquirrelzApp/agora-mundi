import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAutonomousCountryAgendas } from "@/lib/ai-agenda-curator";

/**
 * Tam Otonom Gündem Senkronizasyonu (Admin Onayı Yok)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const countryCode = (body.countryCode || "TR").toUpperCase();

    const country = await prisma.country.findUnique({
      where: { code: countryCode },
      include: {
        agendas: {
          where: { isActive: true },
          orderBy: { slot: "asc" },
        },
      },
    });

    if (!country) {
      return NextResponse.json({ error: "Ülke bulunamadı." }, { status: 404 });
    }

    const currentTitles = country.agendas.map((a) => a.title);
    const newTitles = await generateAutonomousCountryAgendas(
      country.code,
      country.nameTr,
      currentTitles
    );

    const slots = ["A", "B", "C"];
    const updatedAgendas = [];

    for (let i = 0; i < 3; i++) {
      const slot = slots[i];
      const existing = country.agendas.find((a) => a.slot === slot);

      if (existing) {
        await prisma.agendaItem.update({
          where: { id: existing.id },
          data: { isActive: false, archivedAt: new Date() },
        });
      }

      const created = await prisma.agendaItem.create({
        data: {
          countryCode: country.code,
          slot,
          title: newTitles[i],
          isActive: true,
        },
        include: {
          comments: {
            include: { author: true },
          },
        },
      });
      updatedAgendas.push(created);
    }

    await prisma.country.update({
      where: { code: country.code },
      data: { lastUpdatedAt: new Date() },
    });

    return NextResponse.json({
      autonomous: true,
      countryCode: country.code,
      agendas: updatedAgendas,
    });
  } catch (error) {
    console.error("POST /api/agendas/sync error:", error);
    return NextResponse.json(
      { error: "Otonom gündem yenileme başarısız oldu." },
      { status: 500 }
    );
  }
}
