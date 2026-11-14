import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
  return NextResponse.json({ user, googleEnabled });
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        { error: "Oturum açmanız gerekiyor." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const displayName =
      typeof body.displayName === "string"
        ? body.displayName.trim().slice(0, 50)
        : currentUser.displayName;
    const title =
      typeof body.title === "string"
        ? body.title.trim().slice(0, 60)
        : currentUser.title;
    const bio =
      typeof body.bio === "string"
        ? body.bio.trim().slice(0, 280)
        : currentUser.bio;
    const countryCode =
      typeof body.countryCode === "string" && body.countryCode.trim()
        ? body.countryCode.trim().toUpperCase()
        : currentUser.countryCode;

    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        displayName: displayName || currentUser.displayName,
        title: title || "Küresel Gündem Yorumcusu",
        bio,
        countryCode,
      },
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        displayName: updated.displayName,
        title: updated.title,
        bio: updated.bio,
        countryCode: updated.countryCode,
        avatarColor: updated.avatarColor,
        totalLikes: updated.totalLikes,
        weeklyLikes: updated.weeklyLikes,
        followerCount: updated.followerCount,
        followingCount: updated.followingCount,
        globalReachCount: updated.globalReachCount,
      },
    });
  } catch (error) {
    console.error("PATCH /api/auth/me error:", error);
    return NextResponse.json(
      { error: "Profil güncellenemedi." },
      { status: 500 }
    );
  }
}
