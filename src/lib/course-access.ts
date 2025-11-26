import { prisma } from '@/lib/prisma'

type LessonWithCourseLite = {
  courseId: string | null
  course?: {
    id: string
    price: number | null
  } | null
}

export interface CourseAccessResult {
  unlockedViaCourse: boolean
  unlockingCourseId: string | null
  lessonsWithCourse: LessonWithCourseLite[]
}

/**
 * Determines whether a user has access to a resource via any parent course.
 * - Accepts optionally preloaded lessons to avoid extra DB queries.
 * - Falls back to fetching lessons for the resource if not provided.
 * - Treats any course purchase or enrollment (userCourse) as unlocked.
 */
export async function checkCourseUnlockViaLessons(options: {
  userId?: string | null
  resourceId: string
  lessons?: LessonWithCourseLite[]
}): Promise<CourseAccessResult> {
  const { userId, resourceId } = options
  let lessons = options.lessons ?? []

  // Fetch lessons if not provided
  if (!lessons.length) {
    lessons = await prisma.lesson.findMany({
      where: { resourceId },
      include: {
        course: {
          select: { id: true, price: true }
        }
      },
      orderBy: [{ courseId: 'asc' }, { index: 'asc' }]
    })
  }

  // Build course list
  const courseIds = lessons
    .map((lesson) => lesson.course?.id ?? lesson.courseId)
    .filter((id): id is string => Boolean(id))

  if (!userId || courseIds.length === 0) {
    return { unlockedViaCourse: false, unlockingCourseId: null, lessonsWithCourse: lessons }
  }

  // Any purchase on these courses grants access
  const coursePurchases = await prisma.purchase.findMany({
    where: { userId, courseId: { in: courseIds } },
    select: { courseId: true }
  })

  // Enrollment also grants access (covers gifted/comped)
  const userCourse = await prisma.userCourse.findFirst({
    where: { userId, courseId: { in: courseIds } },
    select: { courseId: true }
  })

  const unlockingCourseId =
    coursePurchases[0]?.courseId ??
    userCourse?.courseId ??
    courseIds[0] ??
    null

  const unlockedViaCourse =
    coursePurchases.length > 0 ||
    Boolean(userCourse)

  return { unlockedViaCourse, unlockingCourseId, lessonsWithCourse: lessons }
}
