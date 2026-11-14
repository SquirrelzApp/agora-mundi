import { NextResponse } from "next/server";
import { destroyCurrentSession } from "@/lib/auth";

export async function POST() {
  try {
    await destroyCurrentSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/auth/logout error:", error);
    return NextResponse.json(
      { error: "Çıkış yapılamadı." },
      { status: 500 }
    );
  }
}
