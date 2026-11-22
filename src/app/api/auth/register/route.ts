import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AVATAR_COLORS,
  createUserSession,
  hashPassword,
  normalizeUsername,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawEmail = String(body.email || "")
      .trim()
      .toLowerCase();
    const rawUsername = normalizeUsername(String(body.username || ""));
    const displayName = String(body.displayName || rawUsername).trim();
    const password = String(body.password || "");
    const countryCode = String(body.countryCode || "US")
      .trim()
      .toUpperCase();
    const title = String(body.title || "Global Affairs Commentator")
      .trim()
      .slice(0, 60);
    const bio = String(body.bio || "")
      .trim()
      .slice(0, 280);

    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (rawUsername.length < 3 || rawUsername.length > 24) {
      return NextResponse.json(
        {
          error:
            "Username must be 3–24 characters (letters, numbers, and underscores only).",
        },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: rawEmail }, { username: rawUsername }],
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          error:
            existing.email === rawEmail
              ? "This email address is already registered."
              : "This username is already taken.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const avatarColor =
      AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const created = await prisma.user.create({
      data: {
        email: rawEmail,
        username: rawUsername,
        displayName: displayName.slice(0, 50) || rawUsername,
        passwordHash,
        avatarColor,
        countryCode,
        title: title || "Global Affairs Commentator",
        bio,
      },
    });

    await createUserSession(created.id);

    return NextResponse.json({
      user: {
        id: created.id,
        username: created.username,
        email: created.email,
        displayName: created.displayName,
        title: created.title,
        bio: created.bio,
        countryCode: created.countryCode,
        avatarColor: created.avatarColor,
        totalLikes: created.totalLikes,
        weeklyLikes: created.weeklyLikes,
        followerCount: created.followerCount,
        followingCount: created.followingCount,
        globalReachCount: created.globalReachCount,
      },
    });
  } catch (error) {
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json(
      { error: "An error occurred during registration." },
      { status: 500 }
    );
  }
}
