import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schemas
const paramsSchema = z.object({
  id: z.string().uuid('Invalid resource ID')
})

const updateResourceSchema = z.object({
  price: z.number().int().min(0).optional(),
  noteId: z.string().optional(),
  videoId: z.string().optional(),
  videoUrl: z.string().url().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/resources/[id] - Get a single resource
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    const resolvedParams = await params
    const paramsResult = paramsSchema.safeParse(resolvedParams)

    if (!paramsResult.success) {
      return NextResponse.json(
        { error: 'Invalid resource ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    // Fetch the resource
    const resource = await prisma.resource.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            pubkey: true,
            lud16: true,
          }
        },
        lessons: {
          include: {
            course: {
              select: {
                id: true,
                noteId: true,
                price: true,
              }
            }
          },
          orderBy: { index: 'asc' }
        },
        // Include purchase info if user is authenticated
        purchases: session?.user?.id ? {
          where: { userId: session.user.id },
          select: { 
            id: true,
            amountPaid: true,
            createdAt: true,
          }
        } : false,
      }
    })

    if (!resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      )
    }

    // Check if this is a paid resource and user has access
    const isPaid = resource.price > 0
    const hasPurchased = (resource.purchases || []).some(
      (p) => p.amountPaid >= resource.price
    )
    const isOwner = session?.user?.id === resource.userId

    // For paid resources, only return full data if user has access
    if (isPaid && !hasPurchased && !isOwner) {
      // Return limited information for unpurchased paid resources
      return NextResponse.json({
        success: true,
        data: {
          id: resource.id,
          price: resource.price,
          noteId: resource.noteId,
          createdAt: resource.createdAt,
          user: resource.user,
          isPaid: true,
          requiresPurchase: true,
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: resource
    })
  } catch (error) {
    console.error('Failed to fetch resource:', error)
    return NextResponse.json(
      { error: 'Failed to fetch resource' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/resources/[id] - Update a resource
 * Only the resource owner or admin can update
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const paramsResult = paramsSchema.safeParse(resolvedParams)

    if (!paramsResult.success) {
      return NextResponse.json(
        { error: 'Invalid resource ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    // Fetch the resource to check ownership
    const resource = await prisma.resource.findUnique({
      where: { id },
      select: { userId: true }
    })

    if (!resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      )
    }

    // Check authorization
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    })

    const isOwner = resource.userId === session.user.id
    const isAdmin = user?.role?.admin || false

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validationResult = updateResourceSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const updateData = validationResult.data

    // Update the resource
    const updatedResource = await prisma.resource.update({
      where: { id },
      data: updateData,
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
      data: updatedResource,
      message: 'Resource updated successfully'
    })
  } catch (error) {
    console.error('Failed to update resource:', error)
    
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Resource with this note ID already exists' },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to update resource' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/resources/[id] - Delete a resource
 * Only the resource owner or admin can delete
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const paramsResult = paramsSchema.safeParse(resolvedParams)

    if (!paramsResult.success) {
      return NextResponse.json(
        { error: 'Invalid resource ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    // Fetch the resource to check ownership and dependencies
    const resource = await prisma.resource.findUnique({
      where: { id },
      include: {
        lessons: true,
        purchases: true,
      }
    })

    if (!resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      )
    }

    // Check authorization
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    })

    const isOwner = resource.userId === session.user.id
    const isAdmin = user?.role?.admin || false

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Check if resource is being used in lessons
    if (resource.lessons.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete resource that is being used in lessons' },
        { status: 409 }
      )
    }

    // Check if resource has been purchased
    if (resource.purchases.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete resource that has been purchased' },
        { status: 409 }
      )
    }

    // Delete the resource
    await prisma.resource.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      message: 'Resource deleted successfully'
    })
  } catch (error) {
    console.error('Failed to delete resource:', error)
    return NextResponse.json(
      { error: 'Failed to delete resource' },
      { status: 500 }
    )
  }
}
