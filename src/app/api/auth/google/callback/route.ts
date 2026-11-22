import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AVATAR_COLORS,
  OAUTH_STATE_COOKIE,
  createUserSession,
  normalizeUsername,
} from "@/lib/auth";

function redirectWithClearState(url: string): NextResponse {
  const res = NextResponse.redirect(url);
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const origin = (
    process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  ).replace(/\/$/, "");

  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return redirectWithClearState(`${origin}/?authError=google_cancelled`);
  }

  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state") || "";
  const storedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value || "";

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${origin}/api/auth/google/callback`;

  if (!code || !clientId || !clientSecret) {
    return redirectWithClearState(`${origin}/?authError=google_config`);
  }

  // Verify CSRF state token in constant time
  const stateA = Buffer.from(returnedState);
  const stateB = Buffer.from(storedState);
  if (
    stateA.length === 0 ||
    stateA.length !== stateB.length ||
    !timingSafeEqual(stateA, stateB)
  ) {
    return redirectWithClearState(`${origin}/?authError=google_state`);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return redirectWithClearState(`${origin}/?authError=google_token`);
    }

    const tokenData = await tokenRes.json();
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    if (!userRes.ok) {
      return redirectWithClearState(`${origin}/?authError=google_profile`);
    }

    const profile = await userRes.json();
    const googleId = String(profile.id || "");
    const email = String(profile.email || "").toLowerCase();
    const verifiedEmail = profile.verified_email !== false;
    const name = String(profile.name || email.split("@")[0] || "Member");

    if (!googleId || !email) {
      return redirectWithClearState(`${origin}/?authError=google_email`);
    }

    if (!verifiedEmail) {
      return redirectWithClearState(`${origin}/?authError=google_unverified`);
    }

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (!user) {
      let baseUsername = normalizeUsername(email.split("@")[0]);
      if (baseUsername.length < 3) baseUsername = `member_${googleId.slice(-5)}`;

      let candidate = baseUsername;
      let suffix = 1;
      while (await prisma.user.findUnique({ where: { username: candidate } })) {
        candidate = `${baseUsername.slice(0, 19)}_${suffix++}`;
      }

      user = await prisma.user.create({
        data: {
          email,
          googleId,
          username: candidate,
          displayName: name.slice(0, 50),
          avatarColor:
            AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
          countryCode: "US",
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId },
      });
    }

    await createUserSession(user.id);
    return redirectWithClearState(`${origin}/`);
  } catch (error) {
    console.error("GET /api/auth/google/callback error:", error);
    return redirectWithClearState(`${origin}/?authError=google_failed`);
  }
}
