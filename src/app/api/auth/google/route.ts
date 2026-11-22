import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { OAUTH_STATE_COOKIE } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "Google OAuth is not configured yet (set GOOGLE_CLIENT_ID in .env).",
      },
      { status: 501 }
    );
  }

  const origin = (
    process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  ).replace(/\/$/, "");
  const redirectUri = `${origin}/api/auth/google/callback`;

  const state = randomBytes(24).toString("hex");
  const isHttps =
    origin.startsWith("https://") ||
    request.headers.get("x-forwarded-proto") === "https";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );

  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
