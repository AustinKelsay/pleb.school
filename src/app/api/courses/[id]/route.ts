import { NextRequest, NextResponse } from 'next/server';
import { CourseAdapter, PurchaseAdapter, LessonAdapter } from '@/lib/db-adapter';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

/**
 * Validation schema for course updates
 * Only allows specific fields to prevent unauthorized modifications
 * Explicitly excludes: id, userId, createdAt, updatedAt, noteId
 */
const updateCourseSchema = z.object({
  price: z.number().int().min(0).max(2100000000).optional(), // Max ~21 BTC in sats
  submissionRequired: z.boolean().optional(),
}).strict(); // Reject any extra fields

/**
 * GET /api/courses/[id] - Fetch a specific course
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    const { id } = await params;
    const courseId = id;
    
    if (!courseId) {
      return NextResponse.json(
        { error: 'Invalid course ID' },
        { status: 400 }
      );
    }

    const course = await CourseAdapter.findById(courseId);
    
    if (!course) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    // Get lessons for this course
    const lessons = await LessonAdapter.findByCourseId(courseId);

    // Fetch purchases for the current user (if authenticated)
    let purchases = [] as Array<{ id: string; amountPaid: number; priceAtPurchase?: number | null; createdAt: string }>
    if (session?.user?.id) {
      const userPurchases = await PurchaseAdapter.findByUserAndCourse(session.user.id, courseId)
      purchases = userPurchases.map((p) => ({
        id: p.id,
        amountPaid: p.amountPaid,
        priceAtPurchase: p.priceAtPurchase,
        createdAt: p.createdAt.toISOString()
      }))
    }

    const price = course.price ?? 0
    const hasPurchased = purchases.some((p) => {
      const hasSnapshot = p.priceAtPurchase !== null && p.priceAtPurchase !== undefined && p.priceAtPurchase > 0
      const snapshot = hasSnapshot ? p.priceAtPurchase! : price
      const required = Math.min(snapshot, price)
      return p.amountPaid >= required
    })
    const isOwner = session?.user?.id && course.userId && session.user.id === course.userId
    const requiresPurchase = price > 0 && !hasPurchased && !isOwner

    // For paid courses, avoid exposing lesson/resource structure to users without access
    if (requiresPurchase) {
      return NextResponse.json({
        course: {
          id: course.id,
          userId: course.userId,
          price: course.price,
          noteId: course.noteId,
          submissionRequired: course.submissionRequired,
          createdAt: course.createdAt,
          updatedAt: course.updatedAt,
          user: course.user,
          purchases,
          hasPurchased,
          requiresPurchase
        }
      })
    }

    // Get resources for each lesson only after access is confirmed
    const { ResourceAdapter } = await import('@/lib/db-adapter');
    const lessonsWithResources = await Promise.all(
      lessons.map(async (lesson) => {
        if (lesson.resourceId) {
          const resource = await ResourceAdapter.findById(lesson.resourceId);
          return { ...lesson, resource };
        }
        return lesson;
      })
    );

    return NextResponse.json({ 
      course: {
        ...course,
        lessons: lessonsWithResources,
        purchases,
        hasPurchased,
        requiresPurchase
      }
    });
  } catch (error) {
    console.error('Error fetching course with lessons:', error);
    return NextResponse.json(
      { error: 'Failed to fetch course', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/courses/[id] - Update a specific course
 * Only the course owner or admin can update
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const courseId = id;

    if (!courseId) {
      return NextResponse.json(
        { error: 'Invalid course ID' },
        { status: 400 }
      );
    }

    // Fetch the course to check ownership
    const course = await CourseAdapter.findById(courseId);
    if (!course) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    // Check authorization: must be owner or admin
    const isOwner = course.userId === session.user.id;

    // Check if user is admin via role
    const { prisma } = await import('@/lib/prisma');
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });
    const isAdmin = user?.role?.admin || false;

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Parse and validate request body - only allow specific fields
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const validationResult = updateCourseSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const updateData = validationResult.data;

    // Ensure at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const updatedCourse = await CourseAdapter.update(courseId, updateData);

    return NextResponse.json(
      { course: updatedCourse, message: 'Course updated successfully' }
    );
  } catch (error) {
    console.error('Error updating course:', error);
    return NextResponse.json(
      { error: 'Failed to update course' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/courses/[id] - Delete a specific course
 * Only the course owner or admin can delete
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const courseId = id;

    if (!courseId) {
      return NextResponse.json(
        { error: 'Invalid course ID' },
        { status: 400 }
      );
    }

    // Fetch the course to check ownership and dependencies
    const course = await CourseAdapter.findById(courseId);
    if (!course) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    // Check authorization: must be owner or admin
    const isOwner = course.userId === session.user.id;

    // Check if user is admin via role
    const { prisma } = await import('@/lib/prisma');
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });
    const isAdmin = user?.role?.admin || false;

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Check if course has been purchased before deleting
    const purchaseCount = await PurchaseAdapter.countByCourse(courseId)
    if (purchaseCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete course that has been purchased' },
        { status: 409 }
      );
    }

    // Check if course has associated lessons before deleting
    // Prevent orphaned lessons that would lose their course reference
    // Note: Theoretical TOCTOU race exists here (lesson could be added between check and delete)
    // but practical risk is negligible since only owner/admin can delete their own course.
    const lessonCount = await LessonAdapter.countByCourse(courseId)
    if (lessonCount > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete course with associated lessons',
          details: `Course has ${lessonCount} lesson(s). Remove lessons first or delete the course draft instead.`
        },
        { status: 409 }
      );
    }

    const deleted = await CourseAdapter.delete(courseId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete course' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Course deleted successfully' }
    );
  } catch (error) {
    console.error('Error deleting course:', error);
    return NextResponse.json(
      { error: 'Failed to delete course' },
      { status: 500 }
    );
  }
} 
