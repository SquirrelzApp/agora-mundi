import { NextRequest, NextResponse } from "next/server";

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

  const origin =
    process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const redirectUri = `${origin.replace(/\/$/, "")}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
