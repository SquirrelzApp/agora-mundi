import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const updatedUser = await prisma.user.update({
      where: { username: params.username },
      data: {
        followerCount: { increment: 1 },
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("POST /api/users/[username]/follow error:", error);
    return NextResponse.json(
      { error: "Takip işlemi gerçekleştirilemedi." },
      { status: 500 }
    );
  }
}
