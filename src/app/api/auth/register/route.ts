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
    const countryCode = String(body.countryCode || "TR")
      .trim()
      .toUpperCase();
    const title = String(body.title || "Küresel Gündem Yorumcusu")
      .trim()
      .slice(0, 60);
    const bio = String(body.bio || "")
      .trim()
      .slice(0, 280);

    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return NextResponse.json(
        { error: "Geçerli bir e-posta adresi girin." },
        { status: 400 }
      );
    }

    if (rawUsername.length < 3 || rawUsername.length > 24) {
      return NextResponse.json(
        {
          error:
            "Kullanıcı adı en az 3, en fazla 24 karakter olmalı (harf, rakam ve alt çizgi).",
        },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Şifreniz en az 6 karakter olmalıdır." },
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
              ? "Bu e-posta adresi zaten kayıtlı."
              : "Bu kullanıcı adı başka biri tarafından kullanılıyor.",
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
        title: title || "Küresel Gündem Yorumcusu",
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
      { error: "Kayıt işlemi sırasında bir hata oluştu." },
      { status: 500 }
    );
  }
}
