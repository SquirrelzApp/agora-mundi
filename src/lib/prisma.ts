import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  sqliteWalInitialized?: boolean;
};

function getDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//i.test(url)) return undefined;
  if (/[?&]connect_timeout=/i.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connect_timeout=15`;
}

const datasourceUrl = getDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: ["error"],
  });

globalForPrisma.prisma = prisma;

if (
  !globalForPrisma.sqliteWalInitialized &&
  (process.env.DATABASE_URL || "").startsWith("file:")
) {
  globalForPrisma.sqliteWalInitialized = true;
  void prisma
    .$queryRawUnsafe("PRAGMA journal_mode = WAL;")
    .then(() => prisma.$queryRawUnsafe("PRAGMA busy_timeout = 10000;"))
    .catch(() => {
      // Non-SQLite or read-only environment fallback
    });
}
