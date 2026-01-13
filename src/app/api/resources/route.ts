import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdminInfo } from '@/lib/admin-utils'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schemas
const querySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  userId: z.uuid().optional(),
  includeNotes: z.coerce.boolean().optional().default(false),
})

const createResourceSchema = z.object({
  id: z.uuid(),
  price: z.number().int().min(0).default(0),
  noteId: z.string().optional(),
  videoId: z.string().optional(),
  videoUrl: z.url().optional(),
})

/**
 * GET /api/resources - List all resources
 * Supports pagination and filtering
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const { searchParams } = new URL(request.url)
    
    // Parse and validate query parameters
    const validationResult = querySchema.safeParse({
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize'),
      userId: searchParams.get('userId'),
      includeNotes: searchParams.get('includeNotes'),
    })

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { page, pageSize, userId, includeNotes } = validationResult.data

    // Build query
    const where = userId ? { userId } : {}
    
    // Get total count
    const totalItems = await prisma.resource.count({ where })
    const totalPages = Math.ceil(totalItems / pageSize)
    const skip = (page - 1) * pageSize

    // Fetch resources
    const resources = await prisma.resource.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            pubkey: true,
          }
        },
        lessons: includeNotes ? {
          include: {
            course: {
              select: {
                id: true,
                noteId: true,
              }
            }
          }
        } : false,
        purchases: session?.user?.id ? {
          where: { userId: session.user.id },
          select: { id: true, amountPaid: true, priceAtPurchase: true, createdAt: true }
        } : false,
      },
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({
      success: true,
      data: resources,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      }
    })
  } catch (error) {
    console.error('Failed to fetch resources:', error)
    return NextResponse.json(
      { error: 'Failed to fetch resources' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/resources - Create a new resource
 * Note: Resources are typically created via the draft publishing flow
 * This endpoint is for direct resource creation (e.g., admin use)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const adminInfo = await getAdminInfo(session)
    if (!adminInfo.isAdmin && !adminInfo.permissions?.createResource) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validationResult = createResourceSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { id, price, noteId, videoId, videoUrl } = validationResult.data

    // Check if resource already exists
    const existing = await prisma.resource.findUnique({
      where: { id }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Resource with this ID already exists' },
        { status: 409 }
      )
    }

    // Create the resource
    const resource = await prisma.resource.create({
      data: {
        id,
        userId: session.user.id,
        price,
        noteId,
        videoId,
        videoUrl,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            pubkey: true,
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: resource,
      message: 'Resource created successfully'
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to create resource:', error)
    
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Resource with this note ID already exists' },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to create resource' },
      { status: 500 }
    )
  }
}
