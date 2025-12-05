/**
 * Seed script to populate database with initial data
 * Mirrors the structure from the mock JSON files
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // Create a test user first
  const testUser = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      id: 'test-user-1',
      email: 'test@example.com',
      username: 'testuser',
      pubkey: 'f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741',
    }
  })

  console.log('✅ Created test user')

  // Create courses
  const courses = [
    {
      id: 'f538f5c5-1a72-4804-8eb1-3f05cea64874',
      userId: testUser.id,
      price: 0,
      submissionRequired: false,
      noteId: 'd2797459e3f15491b39225a68146d3ec375f71d01b57cfe3a559179777e20912'
    },
    {
      id: 'f6825391-831c-44da-904a-9ac3d149b7be',
      userId: testUser.id,
      price: 50000,
      submissionRequired: true,
      noteId: 'be71a57814cf6ac5a1a824546f7e0a891a754df941a07642d1b8022f0e048923'
    },
    {
      id: 'b3a7d9f1-5c8e-4a2b-9f1d-3e7a8b2c4d6e',
      userId: testUser.id,
      price: 100000,
      submissionRequired: false,
      noteId: 'c3f8d9a2b7e1f4a5b8c2d7e9f1a3b5c7d9e2f4a6'
    },
    {
      id: 'a2b5c8d1-7e9f-4b3c-8d2e-9f3a5b7c9d1e',
      userId: testUser.id,
      price: 0,
      submissionRequired: false,
      noteId: 'd4f9e0a3c8f2e5b7a9c3d8e0f2a4b6c8e0f3a5b7'
    },
    {
      id: 'c3d6e9f2-8f0a-4c5d-9e3f-0a6b8c3d5e7f',
      userId: testUser.id,
      price: 75000,
      submissionRequired: true,
      noteId: 'e5f0a1b4d9f3e6c8b0d4e9f5b7c0e2a6f8b2c4d6'
    },
    {
      id: 'd4e7f0a3-9a1b-4d6e-0f4g-1b7c9e4f6g8f',
      userId: testUser.id,
      price: 200000,
      submissionRequired: false,
      noteId: 'f6a1b5e0a4f6e7d9c1e5f0a8c9e3f5b8d0f6a8c0'
    }
  ]

  for (const course of courses) {
    await prisma.course.upsert({
      where: { id: course.id },
      update: {},
      create: course
    })
  }

  console.log(`✅ Created ${courses.length} courses`)

  // Create resources
  const resources = [
    // pleb.school Starter Course resources
    {
      id: '6d8260b3-c902-46ec-8aed-f3b8c8f1229b',
      userId: testUser.id,
      price: 0,
      noteId: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      videoId: null
    },
    {
      id: 'f93827ed-68ad-4b5e-af33-f7424b37f0d6',
      userId: testUser.id,
      price: 0,
      noteId: 'd3ac1f40bf07c045e97c43b6cbdf6f274de464d1c9d5a5c04d04d50fc12156c0',
      videoId: 'starter-lesson-1'
    },
    {
      id: '80aac9d4-8bef-4a92-9ee9-dea1c2d66c3a',
      userId: testUser.id,
      price: 0,
      noteId: '234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1',
      videoId: 'starter-lesson-2'
    },
    {
      id: '6fe3cb4b-2571-4e3b-9159-db78325ee5cc',
      userId: testUser.id,
      price: 0,
      noteId: '34567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
      videoId: 'starter-lesson-3'
    },
    {
      id: 'e5399c72-9b95-46d6-a594-498e673b6c58',
      userId: testUser.id,
      price: 0,
      noteId: '4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123',
      videoId: 'starter-lesson-4'
    },
    {
      id: 'a3083ab5-0187-4b77-83d1-29ae1f644559',
      userId: testUser.id,
      price: 0,
      noteId: '567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
      videoId: 'starter-lesson-5'
    },
    // Standalone resources
    {
      id: '6e138ca7-fa4f-470c-9146-fec270a9688e',
      userId: testUser.id,
      price: 0,
      noteId: 'abd1b6682aaccbaf4260b0da05db07caa30977f663e33eb36eacc56d85e62fa7',
      videoId: 'V_fvmyJ91m0'
    },
    {
      id: 'e25f3d3b-f28b-4edd-a325-380564e6db7d',
      userId: testUser.id,
      price: 0,
      noteId: '758149694299ce464c299f9b97a2c6a3e94536eeeeb939fa981d3b09dbf1cf11',
      videoId: null
    }
  ]

  for (const resource of resources) {
    await prisma.resource.upsert({
      where: { id: resource.id },
      update: {},
      create: resource
    })
  }

  console.log(`✅ Created ${resources.length} resources`)

  // Create lessons for courses
  const lessons = [
    // pleb.school Starter Course lessons
    {
      id: 'lesson-1',
      courseId: 'f538f5c5-1a72-4804-8eb1-3f05cea64874',
      resourceId: '6d8260b3-c902-46ec-8aed-f3b8c8f1229b',
      index: 0
    },
    {
      id: 'lesson-2',
      courseId: 'f538f5c5-1a72-4804-8eb1-3f05cea64874',
      resourceId: 'f93827ed-68ad-4b5e-af33-f7424b37f0d6',
      index: 1
    },
    {
      id: 'lesson-3',
      courseId: 'f538f5c5-1a72-4804-8eb1-3f05cea64874',
      resourceId: '80aac9d4-8bef-4a92-9ee9-dea1c2d66c3a',
      index: 2
    },
    {
      id: 'lesson-4',
      courseId: 'f538f5c5-1a72-4804-8eb1-3f05cea64874',
      resourceId: '6fe3cb4b-2571-4e3b-9159-db78325ee5cc',
      index: 3
    },
    {
      id: 'lesson-5',
      courseId: 'f538f5c5-1a72-4804-8eb1-3f05cea64874',
      resourceId: 'e5399c72-9b95-46d6-a594-498e673b6c58',
      index: 4
    },
    {
      id: 'lesson-6',
      courseId: 'f538f5c5-1a72-4804-8eb1-3f05cea64874',
      resourceId: 'a3083ab5-0187-4b77-83d1-29ae1f644559',
      index: 5
    }
  ]

  for (const lesson of lessons) {
    await prisma.lesson.upsert({
      where: { 
        courseId_index: {
          courseId: lesson.courseId,
          index: lesson.index
        }
      },
      update: {},
      create: lesson
    })
  }

  console.log(`✅ Created ${lessons.length} lessons`)

  console.log('🎉 Database seed completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
