import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

const scrypt = promisify(scryptCb);

export const SESSION_COOKIE_NAME = "agora_session";
export const OAUTH_STATE_COOKIE = "agora_oauth_state";
const SESSION_TTL_DAYS = 30;

export const AVATAR_COLORS = [
  "#1D3557",
  "#0F766E",
  "#9A3412",
  "#3730A3",
  "#166534",
  "#6B21A8",
  "#9F1239",
];

export interface SafeSessionUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  title: string;
  bio: string;
  countryCode: string;
  avatarColor: string;
  totalLikes: number;
  weeklyLikes: number;
  followerCount: number;
  followingCount: number;
  globalReachCount: number;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, "hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  if (keyBuf.length !== derived.length) return false;
  return timingSafeEqual(keyBuf, derived);
}

let warnedDefaultSecret = false;

export function hashSessionToken(rawToken: string): string {
  const secret = process.env.AUTH_SECRET || "agora-mundi-default-secret";
  if (
    process.env.NODE_ENV === "production" &&
    !warnedDefaultSecret &&
    (!process.env.AUTH_SECRET ||
      secret.includes("change-this-secret") ||
      secret === "agora-mundi-default-secret")
  ) {
    warnedDefaultSecret = true;
    console.warn(
      "[auth] WARNING: AUTH_SECRET is missing or using a placeholder in production. Set a strong random AUTH_SECRET."
    );
  }
  return createHash("sha256").update(`${rawToken}:${secret}`).digest("hex");
}

export async function createUserSession(userId: string): Promise<{
  rawToken: string;
  expiresAt: Date;
}> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  const cookieStore = cookies();
  let isHttps = false;
  try {
    const proto = headers().get("x-forwarded-proto");
    isHttps = proto === "https";
  } catch {
    isHttps = process.env.NODE_ENV === "production";
  }

  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    expires: expiresAt,
  });

  return { rawToken, expiresAt };
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    await prisma.session.deleteMany({ where: { tokenHash } });
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser(): Promise<SafeSessionUser | null> {
  try {
    const cookieStore = cookies();
    const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!rawToken) return null;

    const tokenHash = hashSessionToken(rawToken);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    const u = session.user;
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      title: u.title,
      bio: u.bio,
      countryCode: u.countryCode,
      avatarColor: u.avatarColor,
      totalLikes: u.totalLikes,
      weeklyLikes: u.weeklyLikes,
      followerCount: u.followerCount,
      followingCount: u.followingCount,
      globalReachCount: u.globalReachCount,
    };
  } catch {
    return null;
  }
}

export function normalizeUsername(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}
