/**
 * Demo Seed Script
 *
 * Populates the database with demo seed data for the pleb.school demo instance.
 * Creates users, publishes content to Nostr, and sets up demo state.
 *
 * Usage:
 *   npm run db:seed                    # Normal run (publishes to Nostr)
 *   SEED_DRY_RUN=true npm run db:seed  # Dry run (skips Nostr publishing)
 *
 * Environment variables:
 *   SEED_DRY_RUN=true   - Skip publishing to Nostr relays (useful for testing)
 *   PRIVKEY_ENCRYPTION_KEY - Required for encrypting user private keys
 */

import { PrismaClient } from '@prisma/client'
import { encryptPrivkey } from '../src/lib/privkey-crypto'
import { getPersonasWithKeys, getAdminPersonas, type SeedPersonaWithKeys } from './seed/personas'
import {
  createResourceEvent,
  createCourseEvent,
  createProfileEvent,
  publishEvent,
  isDryRun,
  EVENT_KINDS,
} from './seed/nostr-publisher'
import { ALL_COURSES, ALL_STANDALONE, type CourseDefinition, type LessonDefinition } from './seed/content'
import { createDemoState, type DemoStateConfig } from './seed/demo-state'

const prisma = new PrismaClient()

async function main() {
  const dryRun = isDryRun()

  console.log('🌱 Starting enhanced database seed...')
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE: Nostr events will be created but NOT published to relays')
  }
  console.log('')

  // Track created IDs for demo state
  const userIdMap = new Map<string, string>()
  const courseIds: string[] = []
  const resourceIds: string[] = []
  const lessonIdsByCourse = new Map<string, string[]>()

  // ============================================================
  // STEP 1: Create Users
  // ============================================================
  console.log('📝 Creating seed users...')
  const personas = getPersonasWithKeys()
  const personaByIdMap = new Map<string, SeedPersonaWithKeys>()

  for (const persona of personas) {
    const encryptedPrivkey = encryptPrivkey(persona.privkey)

    const user = await prisma.user.upsert({
      where: { pubkey: persona.pubkey },
      update: {
        // Update mutable fields on re-run
        username: persona.username,
        displayName: persona.displayName,
        avatar: persona.avatar,
        banner: persona.banner,
        nip05: persona.nip05,
        lud16: persona.lud16,
      },
      create: {
        id: persona.id,
        pubkey: persona.pubkey,
        privkey: encryptedPrivkey,
        username: persona.username,
        displayName: persona.displayName,
        email: persona.email,
        avatar: persona.avatar,
        banner: persona.banner,
        nip05: persona.nip05,
        lud16: persona.lud16,
        profileSource: persona.profileSource,
        primaryProvider: persona.primaryProvider,
      },
    })

    userIdMap.set(persona.id, user.id)
    personaByIdMap.set(persona.id, persona)
    console.log(`  ✅ ${persona.displayName} (${persona.pubkey.slice(0, 8)}...)`)
  }

  // ============================================================
  // STEP 2: Create Admin Roles
  // ============================================================
  console.log('\n👑 Setting up admin roles...')
  const adminPersonas = getAdminPersonas()

  for (const adminPersona of adminPersonas) {
    const userId = userIdMap.get(adminPersona.id)
    if (!userId) {
      console.warn(`  ⚠️ Admin persona not found in userIdMap: id="${adminPersona.id}", name="${adminPersona.displayName}" - skipping role assignment`)
      continue
    }
    await prisma.role.upsert({
      where: { userId },
      update: { admin: true },
      create: { userId, admin: true },
    })
    console.log(`  ✅ ${adminPersona.displayName} is now admin`)
  }

  // ============================================================
  // STEP 3: Publish User Profiles to Nostr
  // ============================================================
  console.log('\n👤 Publishing user profiles to Nostr...')

  for (const persona of personas) {
    // Skip publishing profile for users without profile data (e.g., anonymous users)
    if (!persona.about) {
      console.log(`  ⏭️  ${persona.displayName} (no profile data, skipping)`)
      continue
    }

    const profileEvent = await createProfileEvent({
      privkey: persona.privkey,
      name: persona.displayName,
      about: persona.about,
      picture: persona.avatar,
      banner: persona.banner,
      nip05: persona.nip05,
      lud16: persona.lud16,
    })

    const result = await publishEvent(profileEvent)
    const relayInfo = dryRun ? '(dry-run)' : `${result.publishedRelays.length} relays`
    console.log(`  📤 ${persona.displayName} profile -> ${relayInfo}`)
  }

  // ============================================================
  // STEP 4: Publish Course Content
  // ============================================================
  console.log('\n📚 Publishing course content...')

  for (const course of ALL_COURSES) {
    const authorPersona = personaByIdMap.get(course.authorPersonaId)
    if (!authorPersona) {
      console.log(`  ⚠️  Skipping course "${course.title}": author persona not found`)
      continue
    }

    const authorUserId = userIdMap.get(course.authorPersonaId)
    if (!authorUserId) {
      console.log(`  ⚠️  Skipping course "${course.title}": author user ID not found for ${course.authorPersonaId}`)
      continue
    }
    console.log(`\n  📖 Course: "${course.title}" by ${authorPersona.displayName}`)

    // Track lesson references for the course event
    const lessonReferences: Array<{ kind: number; pubkey: string; dTag: string }> = []
    const courseLessonIds: string[] = []

    // Publish each lesson
    for (const lesson of course.lessons) {
      const event = await createResourceEvent({
        privkey: authorPersona.privkey,
        dTag: lesson.id,
        title: lesson.title,
        summary: lesson.summary,
        content: lesson.content,
        image: lesson.image,
        price: lesson.price,
        topics: lesson.topics,
        type: lesson.type,
        videoUrl: lesson.videoUrl,
      })

      const result = await publishEvent(event)
      const relayInfo = dryRun ? '(dry-run)' : `${result.publishedRelays.length} relays`
      console.log(`    📤 "${lesson.title}" -> ${relayInfo}`)

      // Create resource in database
      await prisma.resource.upsert({
        where: { id: lesson.id },
        update: {
          userId: authorUserId,
          price: lesson.price,
          noteId: event.id,
          videoId: lesson.type === 'video' ? lesson.id : null,
          videoUrl: lesson.type === 'video' ? lesson.videoUrl : null,
        },
        create: {
          id: lesson.id,
          userId: authorUserId,
          price: lesson.price,
          noteId: event.id,
          videoId: lesson.type === 'video' ? lesson.id : null,
          videoUrl: lesson.type === 'video' ? lesson.videoUrl : null,
        },
      })

      resourceIds.push(lesson.id)

      // Track for course event
      const lessonKind = lesson.price > 0 ? EVENT_KINDS.CLASSIFIED_LISTING : EVENT_KINDS.LONG_FORM_CONTENT
      lessonReferences.push({
        kind: lessonKind,
        pubkey: authorPersona.pubkey,
        dTag: lesson.id,
      })
    }

    // Publish the course event
    const courseEvent = await createCourseEvent({
      privkey: authorPersona.privkey,
      dTag: course.id,
      title: course.title,
      description: course.description,
      image: course.image,
      price: course.price,
      topics: course.topics,
      lessonReferences,
    })

    const courseResult = await publishEvent(courseEvent)
    const courseRelayInfo = dryRun ? '(dry-run)' : `${courseResult.publishedRelays.length} relays`
    console.log(`    📤 Course event -> ${courseRelayInfo}`)

    // Create course in database
    await prisma.course.upsert({
      where: { id: course.id },
      update: {
        userId: authorUserId,
        price: course.price,
        noteId: courseEvent.id,
        submissionRequired: false,
      },
      create: {
        id: course.id,
        userId: authorUserId,
        price: course.price,
        noteId: courseEvent.id,
        submissionRequired: false,
      },
    })

    courseIds.push(course.id)

    // Create lesson junction records
    for (let i = 0; i < course.lessons.length; i++) {
      const lesson = course.lessons[i]
      const lessonId = `${course.id}-lesson-${i}`

      const savedLesson = await prisma.lesson.upsert({
        where: {
          courseId_index: {
            courseId: course.id,
            index: i,
          },
        },
        update: {
          resourceId: lesson.id,
        },
        create: {
          id: lessonId,
          courseId: course.id,
          resourceId: lesson.id,
          index: i,
        },
      })

      courseLessonIds.push(savedLesson.id)
    }

    lessonIdsByCourse.set(course.id, courseLessonIds)
  }

  // ============================================================
  // STEP 5: Publish Standalone Resources
  // ============================================================
  console.log('\n📄 Publishing standalone resources...')

  for (const resource of ALL_STANDALONE) {
    const authorPersona = personaByIdMap.get(resource.authorPersonaId)
    const authorUserId = userIdMap.get(resource.authorPersonaId)
    if (!authorPersona || !authorUserId) {
      console.log(`  ⚠️  Skipping resource "${resource.title}": author not found`)
      continue
    }

    const event = await createResourceEvent({
      privkey: authorPersona.privkey,
      dTag: resource.id,
      title: resource.title,
      summary: resource.summary,
      content: resource.content,
      image: resource.image,
      price: resource.price,
      topics: resource.topics,
      type: resource.type,
      videoUrl: resource.videoUrl,
    })

    const result = await publishEvent(event)
    const relayInfo = dryRun ? '(dry-run)' : `${result.publishedRelays.length} relays`
    const priceInfo = resource.price > 0 ? ` (${resource.price} sats)` : ' (free)'
    console.log(`  📤 "${resource.title}"${priceInfo} -> ${relayInfo}`)

    // Create resource in database
    await prisma.resource.upsert({
      where: { id: resource.id },
      update: {
        userId: authorUserId,
        price: resource.price,
        noteId: event.id,
        videoId: resource.type === 'video' ? resource.id : null,
        videoUrl: resource.type === 'video' ? resource.videoUrl : null,
      },
      create: {
        id: resource.id,
        userId: authorUserId,
        price: resource.price,
        noteId: event.id,
        videoId: resource.type === 'video' ? resource.id : null,
        videoUrl: resource.type === 'video' ? resource.videoUrl : null,
      },
    })

    resourceIds.push(resource.id)
  }

  // ============================================================
  // STEP 6: Create Demo State
  // ============================================================
  console.log('\n🎮 Creating demo state...')

  const demoConfig: DemoStateConfig = {
    userIdMap,
    courseIds,
    resourceIds,
    lessonIdsByCourse,
  }

  await createDemoState(prisma, demoConfig)

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n' + '='.repeat(50))
  console.log('🎉 Database seed completed!')
  console.log('='.repeat(50))
  console.log(`
Summary:
  Users created:     ${personas.length}
  Courses created:   ${courseIds.length}
  Resources created: ${resourceIds.length}
  Admin roles:       ${adminPersonas.length}

${dryRun ? '⚠️  DRY RUN: No events were published to Nostr relays.' : '✅ Events published to Nostr relays.'}

To run with real publishing:
  npm run db:seed

To run in dry-run mode (no Nostr publishing):
  SEED_DRY_RUN=true npm run db:seed
`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
