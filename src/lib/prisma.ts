import { PrismaClient, type Prisma } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const enableQueryLogging = (() => {
  if (process.env.PRISMA_LOG_QUERIES !== undefined) {
    return process.env.PRISMA_LOG_QUERIES === 'true'
  }
  return process.env.NODE_ENV === 'development'
})()

const prismaLogLevels: Prisma.LogLevel[] = enableQueryLogging
  ? ['query', 'warn', 'error']
  : ['warn', 'error']

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: prismaLogLevels,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
