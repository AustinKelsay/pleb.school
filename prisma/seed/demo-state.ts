/**
 * Demo State Generator
 *
 * Creates demo user progress, enrollments, and purchases to demonstrate
 * platform features. This simulates what a real user's experience would look like.
 */

import type { PrismaClient } from '../../src/generated/prisma'

export interface DemoStateConfig {
  /** Map of persona ID to database user ID */
  userIdMap: Map<string, string>
  /** Course IDs that have been created */
  courseIds: string[]
  /** Resource IDs that have been created */
  resourceIds: string[]
  /** Lesson IDs mapped by course ID */
  lessonIdsByCourse: Map<string, string[]>
}

/**
 * Create demo state: progress, enrollments, and purchases
 */
export async function createDemoState(
  prisma: PrismaClient,
  config: DemoStateConfig
): Promise<void> {
  const { userIdMap, courseIds, lessonIdsByCourse } = config

  // Get the demo users
  const newbieUserId = userIdMap.get('nostr-newbie')
  const anonUserId = userIdMap.get('anon-learner')

  if (!newbieUserId) {
    console.log('  ⚠️  Skipping demo state: nostr-newbie user not found')
    return
  }

  // 1. Create partial course progress for nostr-newbie on welcome course
  const welcomeCourseId = courseIds.find(id => id.includes('welcome'))
  if (welcomeCourseId) {
    await createCourseProgress(prisma, newbieUserId, welcomeCourseId, lessonIdsByCourse)
  }

  // 2. Create purchase for nostr-newbie on zaps course (simulated)
  const zapsCourseId = courseIds.find(id => id.includes('zaps') || id.includes('mastering'))
  if (zapsCourseId) {
    await createSimulatedPurchase(prisma, newbieUserId, zapsCourseId)
  }

  // 3. Create enrollment for anon-learner (not started)
  if (anonUserId && welcomeCourseId) {
    await createEnrollment(prisma, anonUserId, welcomeCourseId)
  }
}

/**
 * Create partial course progress (started, some lessons completed)
 */
async function createCourseProgress(
  prisma: PrismaClient,
  userId: string,
  courseId: string,
  lessonIdsByCourse: Map<string, string[]>
): Promise<void> {
  // Create UserCourse enrollment (started but not completed)
  await prisma.userCourse.upsert({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
    update: {},
    create: {
      userId,
      courseId,
      started: true,
      startedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Started 7 days ago
      completed: false,
    },
  })

  // Get lessons for this course
  const lessons = await prisma.lesson.findMany({
    where: { courseId },
    orderBy: { index: 'asc' },
  })

  // Mark first 2 lessons as completed, third as opened but not completed
  for (let i = 0; i < Math.min(lessons.length, 3); i++) {
    const lesson = lessons[i]
    const isCompleted = i < 2 // First 2 are completed
    const daysAgo = 7 - i // Stagger the times

    await prisma.userLesson.upsert({
      where: {
        userId_lessonId: {
          userId,
          lessonId: lesson.id,
        },
      },
      update: {},
      create: {
        userId,
        lessonId: lesson.id,
        opened: true,
        completed: isCompleted,
        openedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        completedAt: isCompleted
          ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
          : null,
      },
    })
  }

  console.log(`  ✅ Created course progress for user in ${courseId}`)
}

/**
 * Create a simulated purchase (manual payment type to indicate seed data)
 */
async function createSimulatedPurchase(
  prisma: PrismaClient,
  userId: string,
  courseId: string
): Promise<void> {
  // Get the course to find its price
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { price: true },
  })

  if (!course) {
    console.log(`  ⚠️  Course ${courseId} not found for purchase`)
    return
  }

  // Check if purchase already exists
  const existingPurchase = await prisma.purchase.findUnique({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
  })

  if (existingPurchase) {
    console.log(`  ⚠️  Purchase already exists for ${courseId}`)
    return
  }

  // Create purchase with 'manual' payment type to indicate it's seed data
  await prisma.purchase.create({
    data: {
      userId,
      courseId,
      amountPaid: course.price,
      priceAtPurchase: course.price,
      paymentType: 'manual', // Indicates seed/demo data, not real zap
    },
  })

  // Also create UserCourse enrollment
  await prisma.userCourse.upsert({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
    update: {},
    create: {
      userId,
      courseId,
      started: false,
      completed: false,
    },
  })

  console.log(`  ✅ Created simulated purchase for ${courseId}`)
}

/**
 * Create an enrollment without progress (just enrolled, not started)
 */
async function createEnrollment(
  prisma: PrismaClient,
  userId: string,
  courseId: string
): Promise<void> {
  await prisma.userCourse.upsert({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
    update: {},
    create: {
      userId,
      courseId,
      started: false,
      completed: false,
    },
  })

  console.log(`  ✅ Created enrollment for user in ${courseId}`)
}
