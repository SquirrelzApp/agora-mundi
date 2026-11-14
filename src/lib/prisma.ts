import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  sqliteWalInitialized?: boolean;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
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
