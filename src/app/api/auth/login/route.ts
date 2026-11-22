import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createUserSession,
  normalizeUsername,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = String(body.identifier || body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Email / username and password are required." },
        { status: 400 }
      );
    }

    const normalizedUser = normalizeUsername(identifier.replace(/^@/, ""));

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: normalizedUser }],
      },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: "Invalid email/username or password." },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email/username or password." },
        { status: 401 }
      );
    }

    await createUserSession(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        title: user.title,
        bio: user.bio,
        countryCode: user.countryCode,
        avatarColor: user.avatarColor,
        totalLikes: user.totalLikes,
        weeklyLikes: user.weeklyLikes,
        followerCount: user.followerCount,
        followingCount: user.followingCount,
        globalReachCount: user.globalReachCount,
      },
    });
  } catch (error) {
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json(
      { error: "An error occurred while signing in." },
      { status: 500 }
    );
  }
}
