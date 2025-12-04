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
 * - Unlocks if user has a sufficient purchase (amountPaid >= min(priceAtPurchase, currentPrice)) for the course or is enrolled via userCourse.
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

  // Build course map with prices, falling back to courseId when course relation isn't preloaded
  const courseMap = new Map<string, number | null>()
  for (const lesson of lessons) {
    const courseId = lesson.course?.id ?? lesson.courseId
    if (!courseId) continue

    const existingPrice = courseMap.get(courseId)
    const price = lesson.course?.price ?? existingPrice ?? null
    courseMap.set(courseId, price)
  }

  const courseIds = Array.from(courseMap.keys())

  if (!userId || courseIds.length === 0) {
    return { unlockedViaCourse: false, unlockingCourseId: null, lessonsWithCourse: lessons }
  }

  // Fetch course purchases with amounts
  const coursePurchases = await prisma.purchase.findMany({
    where: { userId, courseId: { in: courseIds } },
    select: { courseId: true, amountPaid: true, priceAtPurchase: true }
  })

  // Fetch user courses (enrollments)
  const userCourses = await prisma.userCourse.findMany({
    where: { userId, courseId: { in: courseIds } },
    select: { courseId: true }
  })

  // Determine unlocked courses
  const unlockedCourses = new Set<string>()
  for (const purchase of coursePurchases) {
    const courseId = purchase.courseId!
    const currentPrice = courseMap.get(courseId)
    const purchasePrice = purchase.priceAtPurchase !== null && purchase.priceAtPurchase !== undefined && purchase.priceAtPurchase > 0
      ? purchase.priceAtPurchase
      : null

    let requiredPrice: number
    if (purchasePrice != null && currentPrice != null) {
      requiredPrice = Math.min(purchasePrice, currentPrice)
    } else if (purchasePrice != null) {
      requiredPrice = purchasePrice
    } else if (currentPrice != null) {
      requiredPrice = currentPrice
    } else {
      requiredPrice = 0
    }

    if (purchase.amountPaid >= requiredPrice) {
      unlockedCourses.add(courseId)
    }
  }
  for (const uc of userCourses) {
    unlockedCourses.add(uc.courseId)
  }

  const unlockedViaCourse = unlockedCourses.size > 0
  const unlockingCourseId = unlockedCourses.size > 0 ? [...unlockedCourses][0]! : null

  return { unlockedViaCourse, unlockingCourseId, lessonsWithCourse: lessons }
}
