import { NextRequest, NextResponse } from 'next/server';
import { CourseAdapter, PurchaseAdapter } from '@/lib/db-adapter';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

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
    const { LessonAdapter } = await import('@/lib/db-adapter');
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

    // Get resources for each lesson
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

    const price = course.price ?? 0
    const hasPurchased = purchases.some((p) => {
      const snapshot = p.priceAtPurchase && p.priceAtPurchase > 0 ? p.priceAtPurchase : price
      const required = Math.min(snapshot, price)
      return p.amountPaid >= required
    })
    const isOwner = session?.user?.id && course.userId && session.user.id === course.userId
    const requiresPurchase = price > 0 && !hasPurchased && !isOwner

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
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const courseId = id;
    const body = await request.json();
    
    if (!courseId) {
      return NextResponse.json(
        { error: 'Invalid course ID' },
        { status: 400 }
      );
    }

    const updatedCourse = await CourseAdapter.update(courseId, body);
    
    return NextResponse.json(
      { course: updatedCourse, message: 'Course updated successfully' }
    );
  } catch (error) {
    console.error('Error updating course:', error);
    return NextResponse.json(
      { error: 'Failed to update course', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/courses/[id] - Delete a specific course
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const courseId = id;
    
    if (!courseId) {
      return NextResponse.json(
        { error: 'Invalid course ID' },
        { status: 400 }
      );
    }

    const deleted = await CourseAdapter.delete(courseId);
    
    if (!deleted) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'Course deleted successfully' }
    );
  } catch (error) {
    console.error('Error deleting course:', error);
    return NextResponse.json(
      { error: 'Failed to delete course', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 
