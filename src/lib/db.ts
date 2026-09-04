import { PrismaClient } from '@prisma/client'
import { validateEnv } from '@/lib/config'

// Validate environment on server startup
validateEnv()

// Validate DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  const errorMsg = 'DATABASE_URL environment variable is not set. Please add it to your .env.local file or Vercel environment variables.'
  console.error(`❌ ${errorMsg}`)
  if (process.env.NODE_ENV === 'production') {
    throw new Error(errorMsg)
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db