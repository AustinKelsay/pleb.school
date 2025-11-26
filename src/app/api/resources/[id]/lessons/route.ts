import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { checkCourseUnlockViaLessons } from '@/lib/course-access'

export const dynamic = 'force-dynamic'

// Validation schemas
const paramsSchema = z.object({
  id: z.string().uuid('Invalid resource ID')
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/resources/[id]/lessons - Get all lessons that use this resource
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

    // Check if resource exists
    const resource = await prisma.resource.findUnique({
      where: { id },
      select: { 
        id: true,
        userId: true,
        price: true 
      }
    })

    if (!resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      )
    }

    // Fetch lessons that use this resource
    const lessons = await prisma.lesson.findMany({
      where: { resourceId: id },
      include: {
        course: {
          select: {
            id: true,
            userId: true,
            price: true,
            noteId: true,
          }
        }
      },
      orderBy: [
        { courseId: 'asc' },
        { index: 'asc' }
      ]
    })

    // Check access permissions for paid content
    const isOwner = session?.user?.id === resource.userId
    const isPaidResource = resource.price > 0

    // If it's a paid resource and user is not the owner, check purchases
    if (isPaidResource && !isOwner && session?.user?.id) {
      const hasPurchasedResource = await prisma.purchase.findFirst({
        where: {
          userId: session.user.id,
          resourceId: id,
          amountPaid: { gte: resource.price }
        }
      })

      const courseAccess = await checkCourseUnlockViaLessons({
        userId: session.user.id,
        resourceId: id,
        lessons
      })
      const hasPurchasedCourse = courseAccess.unlockedViaCourse

      if (!hasPurchasedResource && !hasPurchasedCourse) {
        // Return limited information for unpurchased paid resources
        return NextResponse.json({
          success: true,
          data: {
            resourceId: id,
            lessonCount: lessons.length,
            isPaid: true,
            requiresPurchase: true,
          }
        })
      }
    }

    // Group lessons by course for better organization
    const lessonsByCourse = lessons.reduce((acc, lesson) => {
      if (!lesson.course) return acc
      
      const courseId = lesson.course.id
      if (!acc[courseId]) {
        acc[courseId] = {
          course: lesson.course,
          lessons: []
        }
      }
      
      acc[courseId].lessons.push({
        id: lesson.id,
        index: lesson.index,
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
      })
      
      return acc
    }, {} as Record<string, {
      course: {
        id: string
        userId: string
        price: number
        noteId: string | null
      },
      lessons: Array<{
        id: string
        index: number
        createdAt: Date
        updatedAt: Date
      }>
    }>)

    return NextResponse.json({
      success: true,
      data: {
        resourceId: id,
        lessonCount: lessons.length,
        courses: Object.values(lessonsByCourse),
        lessons: lessons.map(lesson => ({
          id: lesson.id,
          courseId: lesson.courseId,
          index: lesson.index,
          createdAt: lesson.createdAt,
          updatedAt: lesson.updatedAt,
        }))
      }
    })
  } catch (error) {
    console.error('Failed to fetch resource lessons:', error)
    return NextResponse.json(
      { error: 'Failed to fetch resource lessons' },
      { status: 500 }
    )
  }
}
