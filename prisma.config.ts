import { defineConfig } from 'prisma/config'
import dotenv from 'dotenv'

// Load .env file if it exists (for local dev; Docker sets env vars directly)
dotenv.config()

// Use a placeholder URL for schema-only operations (e.g., prisma generate)
// Real DATABASE_URL is required for migrations and runtime queries
const databaseUrl = process.env.DATABASE_URL || 'postgresql://placeholder:5432/placeholder'

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: databaseUrl,
  },
})
