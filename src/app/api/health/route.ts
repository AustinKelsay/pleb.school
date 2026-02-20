import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Health check endpoint
 * Used for monitoring and verifying the API is running
 * Checks database connectivity to report accurate health status
 */
export async function GET() {
  // Check database connection
  const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

  return NextResponse.json(
    {
      status: dbOk ? 'healthy' : 'degraded',
      checks: { database: dbOk },
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    },
    { status: dbOk ? 200 : 503 }
  );
}

/**
 * Handle unsupported methods
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
} 