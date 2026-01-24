import { defineConfig } from 'prisma/config'
import dotenv from 'dotenv'

// Load .env file if it exists (for local dev; Docker sets env vars directly)
dotenv.config()

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
