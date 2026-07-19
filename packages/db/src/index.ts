import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

/**
 * Cliente Prisma singleton. En dev evita múltiples instancias por el
 * hot-reload; en prod es una sola instancia por proceso.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
