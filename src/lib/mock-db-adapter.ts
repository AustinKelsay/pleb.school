/**
 * Database adapter for JSON seed data
 * Simulates database operations with JSON files
 */

import { Course, Resource, Lesson } from '@/data/types'
import { NostrEvent } from 'snstr'
import courseSeedData from '@/data/mockDb/Course.json'
import resourceSeedData from '@/data/mockDb/Resource.json'
import lessonSeedData from '@/data/mockDb/Lesson.json'

// Pagination options for query functions
export interface PaginationOptions {
  page?: number
  pageSize?: number
}

// Extended types with Nostr note data
export interface CourseWithNote extends Course {
  note?: NostrEvent
  noteError?: string
}

export interface ResourceWithNote extends Resource {
  note?: NostrEvent
  noteError?: string
}

// Type the imported JSON data with proper transformations
const courseData: Course[] = courseSeedData.map(course => ({
  ...course,
  submissionRequired: course.submissionRequired === 'True' || course.submissionRequired === 'true'
})) as Course[]
const resourceData: Resource[] = resourceSeedData as Resource[]
const lessonData: Lesson[] = lessonSeedData.map(lesson => ({
  ...lesson,
  // Convert NULL strings to undefined for optional fields
  courseId: lesson.courseId === 'NULL' ? undefined : lesson.courseId,
  resourceId: lesson.resourceId === 'NULL' ? undefined : lesson.resourceId,
  draftId: lesson.draftId === 'NULL' ? undefined : lesson.draftId
})) as Lesson[]

// Mock Nostr events data - in a real app, these would be fetched from Nostr relays
// using the noteId references from the database records
const mockNostrEvents: NostrEvent[] = [
  // Course event for the starter course
  {
    id: "d2797459e3f15491b39225a68146d3ec375f71d01b57cfe3a559179777e20912",
    pubkey: "f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741",
    created_at: 1740860353,
    kind: 30004,
    content: "",
    sig: "example_signature",
    tags: [
      ["d", "f538f5c5-1a72-4804-8eb1-3f05cea64874"],
      ["name", "pleb.school Starter Course"],
      [
        "about",
        "Welcome to the pleb.school starter course! Use this demo track to explore how the configurable, Nostr-native platform delivers lessons across web and relays."
      ],
      ["image", "https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/images/plebdevs-starter.png"],
      ["t", "beginner"],
      ["t", "frontend"],
      ["t", "course"]
    ]
  } as NostrEvent,
  // Bitcoin Development Fundamentals course
  {
    id: "be71a57814cf6ac5a1a824546f7e0a891a754df941a07642d1b8022f0e048923",
    pubkey: "f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741",
    created_at: 1740860353,
    kind: 30004,
    content: "",
    sig: "example_signature",
    tags: [
      ["d", "f6825391-831c-44da-904a-9ac3d149b7be"],
      ["name", "Bitcoin Development Fundamentals"],
      ["about", "Master Bitcoin development from the ground up. Learn about Bitcoin protocol, scripting, transactions, and building applications on Bitcoin."],
      ["image", "https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/images/bitcoin-fundamentals.png"],
      ["t", "bitcoin"],
      ["t", "intermediate"],
      ["t", "course"]
    ]
  } as NostrEvent,
  // Lightning Network Development course
  {
    id: "c3f8d9a2b7e1f4a5b8c2d7e9f1a3b5c7d9e2f4a6",
    pubkey: "f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741",
    created_at: 1740860353,
    kind: 30004,
    content: "",
    sig: "example_signature",
    tags: [
      ["d", "b3a7d9f1-5c8e-4a2b-9f1d-3e7a8b2c4d6e"],
      ["name", "Lightning Network Development"],
      ["about", "Build applications on the Lightning Network. Learn about payment channels, routing, invoices, and integrating Lightning payments into your apps."],
      ["image", "https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/images/lightning-dev.png"],
      ["t", "lightning"],
      ["t", "intermediate"],
      ["t", "course"]
    ]
  } as NostrEvent,
  // Nostr Protocol Development course
  {
    id: "d4f9e0a3c8f2e5b7a9c3d8e0f2a4b6c8e0f3a5b7",
    pubkey: "f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741",
    created_at: 1740860353,
    kind: 30004,
    content: "",
    sig: "example_signature",
    tags: [
      ["d", "a2b5c8d1-7e9f-4b3c-8d2e-9f3a5b7c9d1e"],
      ["name", "Nostr Protocol Development"],
      ["about", "Learn to build decentralized applications on Nostr. Understand the protocol, create clients, work with relays, and implement NIPs."],
      ["image", "https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/images/nostr-dev.png"],
      ["t", "nostr"],
      ["t", "intermediate"],
      ["t", "course"]
    ]
  } as NostrEvent,
  // Frontend Development for Bitcoin course
  {
    id: "e5f0a1b4d9f3e6c8b0d4e9f5b7c0e2a6f8b2c4d6",
    pubkey: "f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741",
    created_at: 1740860353,
    kind: 30004,
    content: "",
    sig: "example_signature",
    tags: [
      ["d", "c3d6e9f2-8f0a-4c5d-9e3f-0a6b8c3d5e7f"],
      ["name", "Frontend Development for Bitcoin"],
      ["about", "Build modern frontend applications that integrate with Bitcoin. Learn React, TypeScript, and how to connect to Bitcoin and Lightning networks."],
      ["image", "https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/images/frontend-bitcoin.png"],
      ["t", "frontend"],
      ["t", "bitcoin"],
      ["t", "intermediate"],
      ["t", "course"]
    ]
  } as NostrEvent,
  // Lightning Network API Integration course
  {
    id: "f6a1b5e0a4f6e7d9c1e5f0a8c9e3f5b8d0f6a8c0",
    pubkey: "f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741",
    created_at: 1740860353,
    kind: 30004,
    content: "",
    sig: "example_signature",
    tags: [
      ["d", "d4e7f0a3-9a1b-4d6e-0f4g-1b7c9e4f6g8f"],
      ["name", "Lightning Network API Integration"],
      ["about", "Master Lightning Network APIs and payment processing. Build RESTful APIs, handle Lightning invoices, and create payment workflows."],
      ["image", "https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/images/lightning-api.png"],
      ["t", "lightning"],
      ["t", "backend"],
      ["t", "advanced"],
      ["t", "course"]
    ]
  } as NostrEvent
]

// In-memory storage for runtime modifications
let coursesInMemory: Course[] = [...courseData]
let resourcesInMemory: Resource[] = [...resourceData]
let lessonsInMemory: Lesson[] = [...lessonData]

// ============================================================================
// PURCHASE ADAPTER
// ============================================================================

export interface PurchaseRecord {
  id: string
  amountPaid: number
  priceAtPurchase?: number | null
  createdAt: Date
}

export class PurchaseAdapter {
  static async findByUserAndCourse(_userId: string, _courseId: string): Promise<PurchaseRecord[]> {
    await new Promise(resolve => setTimeout(resolve, 10))
    // Mock data set does not contain purchases yet
    return []
  }

  static async findByUserAndResource(_userId: string, _resourceId: string): Promise<PurchaseRecord[]> {
    await new Promise(resolve => setTimeout(resolve, 10))
    // Mock data set does not contain purchases yet
    return []
  }
}

// ============================================================================
// COURSE ADAPTER
// ============================================================================

export class CourseAdapter {
  static async findAll(): Promise<Course[]> {
    // Simulate database delay
    await new Promise(resolve => setTimeout(resolve, 30))
    return [...coursesInMemory]
  }

  static async findAllPaginated(options?: PaginationOptions): Promise<{
    data: Course[]
    pagination: {
      page: number
      pageSize: number
      totalItems: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
  }> {
    await new Promise(resolve => setTimeout(resolve, 30))
    
    const page = options?.page || 1
    const pageSize = options?.pageSize || 50
    const totalItems = coursesInMemory.length
    const totalPages = Math.ceil(totalItems / pageSize)
    
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const data = coursesInMemory.slice(startIndex, endIndex)
    
    return {
      data,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  }

  static async findById(id: string): Promise<Course | null> {
    await new Promise(resolve => setTimeout(resolve, 20))
    return coursesInMemory.find(course => course.id === id) || null
  }

  static async findByIdWithNote(id: string): Promise<CourseWithNote | null> {
    await new Promise(resolve => setTimeout(resolve, 20))
    const course = coursesInMemory.find(course => course.id === id)
    if (!course) return null
    
    // Find the associated Nostr note - simulate fetching by noteId
    const note = mockNostrEvents.find(event => event.id === course.noteId) || mockNostrEvents[0]
    
    return {
      ...course,
      note: note || undefined
    }
  }

  static async create(courseData: Omit<Course, 'id'>): Promise<Course> {
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const newCourse: Course = {
      ...courseData,
      id: `course-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    }
    
    coursesInMemory.push(newCourse)
    return newCourse
  }

  static async update(id: string, updates: Partial<Course>): Promise<Course | null> {
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const index = coursesInMemory.findIndex(course => course.id === id)
    if (index === -1) return null
    
    coursesInMemory[index] = { ...coursesInMemory[index], ...updates }
    return coursesInMemory[index]
  }

  static async delete(id: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const index = coursesInMemory.findIndex(course => course.id === id)
    if (index === -1) return false
    
    coursesInMemory.splice(index, 1)
    return true
  }

  static async findByUserId(userId: string): Promise<Course[]> {
    await new Promise(resolve => setTimeout(resolve, 30))
    return coursesInMemory.filter(course => course.userId === userId)
  }

  static async findByNoteId(noteId: string): Promise<Course | null> {
    await new Promise(resolve => setTimeout(resolve, 20))
    return coursesInMemory.find(course => course.noteId === noteId) || null
  }
}

// ============================================================================
// RESOURCE ADAPTER
// ============================================================================

export class ResourceAdapter {
  static async findAll(options?: { includeLessonResources?: boolean }): Promise<Resource[]> {
    await new Promise(resolve => setTimeout(resolve, 30))
    const includeLessonResources = options?.includeLessonResources ?? false

    const data = includeLessonResources
      ? resourcesInMemory
      : resourcesInMemory.filter(resource =>
          !lessonsInMemory.some(
            lesson => lesson.resourceId === resource.id && lesson.courseId !== undefined && lesson.courseId !== null
          )
        )

    return [...data]
  }

  static async findAllPaginated(options?: PaginationOptions & { includeLessonResources?: boolean }): Promise<{
    data: Resource[]
    pagination: {
      page: number
      pageSize: number
      totalItems: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
  }> {
    await new Promise(resolve => setTimeout(resolve, 30))
    
    const page = options?.page || 1
    const pageSize = options?.pageSize || 50
    const includeLessonResources = options?.includeLessonResources ?? false

    const filteredResources = includeLessonResources
      ? resourcesInMemory
      : resourcesInMemory.filter(resource =>
          !lessonsInMemory.some(
            lesson => lesson.resourceId === resource.id && lesson.courseId !== undefined && lesson.courseId !== null
          )
        )

    const totalItems = filteredResources.length
    const totalPages = Math.ceil(totalItems / pageSize)
    
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const data = filteredResources.slice(startIndex, endIndex)
    
    return {
      data,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  }

  static async findById(id: string): Promise<Resource | null> {
    await new Promise(resolve => setTimeout(resolve, 20))
    return resourcesInMemory.find(resource => resource.id === id) || null
  }

  static async findByIdWithNote(id: string): Promise<ResourceWithNote | null> {
    await new Promise(resolve => setTimeout(resolve, 20))
    const resource = resourcesInMemory.find(resource => resource.id === id)
    if (!resource) return null
    
    // Find the associated Nostr note - simulate fetching by noteId
    const note = mockNostrEvents.find(event => event.id === resource.noteId)
    
    return {
      ...resource,
      note: note || undefined
    }
  }

  static async create(resourceData: Omit<Resource, 'id'>): Promise<Resource> {
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const newResource: Resource = {
      ...resourceData,
      id: `resource-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    }
    
    resourcesInMemory.push(newResource)
    return newResource
  }

  static async update(id: string, updates: Partial<Resource>): Promise<Resource | null> {
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const index = resourcesInMemory.findIndex(resource => resource.id === id)
    if (index === -1) return null
    
    resourcesInMemory[index] = { ...resourcesInMemory[index], ...updates }
    return resourcesInMemory[index]
  }

  static async delete(id: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const index = resourcesInMemory.findIndex(resource => resource.id === id)
    if (index === -1) return false
    
    resourcesInMemory.splice(index, 1)
    return true
  }

  static async findByUserId(userId: string): Promise<Resource[]> {
    await new Promise(resolve => setTimeout(resolve, 30))
    return resourcesInMemory.filter(resource => resource.userId === userId)
  }

  static async findByNoteId(noteId: string): Promise<Resource | null> {
    await new Promise(resolve => setTimeout(resolve, 20))
    return resourcesInMemory.find(resource => resource.noteId === noteId) || null
  }

  static async findByVideoId(videoId: string): Promise<Resource | null> {
    await new Promise(resolve => setTimeout(resolve, 20))
    return resourcesInMemory.find(resource => resource.videoId === videoId) || null
  }

  static async findFree(): Promise<Resource[]> {
    await new Promise(resolve => setTimeout(resolve, 30))
    return resourcesInMemory.filter(resource => resource.price === 0)
  }

  static async findPaid(): Promise<Resource[]> {
    await new Promise(resolve => setTimeout(resolve, 30))
    return resourcesInMemory.filter(resource => resource.price > 0)
  }

  static async isLesson(resourceId: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 20))
    return lessonsInMemory.some(lesson => lesson.resourceId === resourceId && lesson.courseId !== undefined)
  }
}

// ============================================================================
// LESSON ADAPTER
// ============================================================================

export class LessonAdapter {
  static async findAll(): Promise<Lesson[]> {
    await new Promise(resolve => setTimeout(resolve, 30))
    return [...lessonsInMemory]
  }

  static async findById(id: string): Promise<Lesson | null> {
    await new Promise(resolve => setTimeout(resolve, 20))
    return lessonsInMemory.find(lesson => lesson.id === id) || null
  }

  static async findByCourseId(courseId: string): Promise<Lesson[]> {
    await new Promise(resolve => setTimeout(resolve, 30))
    return lessonsInMemory
      .filter(lesson => lesson.courseId === courseId)
      .sort((a, b) => a.index - b.index)
  }

  static async findByResourceId(resourceId: string): Promise<Lesson[]> {
    await new Promise(resolve => setTimeout(resolve, 30))
    return lessonsInMemory.filter(lesson => lesson.resourceId === resourceId)
  }

  static async create(lessonData: Omit<Lesson, 'id'>): Promise<Lesson> {
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const newLesson: Lesson = {
      ...lessonData,
      id: `lesson-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    }
    
    lessonsInMemory.push(newLesson)
    return newLesson
  }

  static async update(id: string, updates: Partial<Lesson>): Promise<Lesson | null> {
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const index = lessonsInMemory.findIndex(lesson => lesson.id === id)
    if (index === -1) return null
    
    lessonsInMemory[index] = { ...lessonsInMemory[index], ...updates }
    return lessonsInMemory[index]
  }

  static async delete(id: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const index = lessonsInMemory.findIndex(lesson => lesson.id === id)
    if (index === -1) return false
    
    lessonsInMemory.splice(index, 1)
    return true
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function resetSeedData() {
  coursesInMemory = [...courseData]
  resourcesInMemory = [...resourceData]
  lessonsInMemory = [...lessonData]
}

export function getSeedDataStats() {
  return {
    courses: coursesInMemory.length,
    resources: resourcesInMemory.length,
    lessons: lessonsInMemory.length,
    coursesFromSeed: courseData.length,
    resourcesFromSeed: resourceData.length,
    lessonsFromSeed: lessonData.length
  }
}

// Synchronous access for backwards compatibility (temporary)
export function getCoursesSync(): Course[] {
  return [...coursesInMemory]
}

export function getResourcesSync(): Resource[] {
  return [...resourcesInMemory]
}

export function getLessonsSync(): Lesson[] {
  return [...lessonsInMemory]
}
