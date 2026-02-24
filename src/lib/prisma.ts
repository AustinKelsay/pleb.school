import { PrismaClient, type Prisma } from '@/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { getEnv } from './env'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}
const env = getEnv()

const enableQueryLogging = (() => {
  if (process.env.PRISMA_LOG_QUERIES !== undefined) {
    return process.env.PRISMA_LOG_QUERIES === 'true'
  }
  return process.env.NODE_ENV === 'development'
})()

const prismaLogLevels: Prisma.LogLevel[] = enableQueryLogging
  ? ['query', 'warn', 'error']
  : ['warn', 'error']

const pool = globalForPrisma.pool ?? new Pool({
  // Keep non-production contexts flexible while enforcing production validation in env.ts.
  connectionString: env.DATABASE_URL ?? 'postgresql://placeholder:5432/placeholder',
})

const adapter = new PrismaPg(pool)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: prismaLogLevels,
  })

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.pool = pool
}
