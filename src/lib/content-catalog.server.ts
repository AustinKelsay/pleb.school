import {
  applyContentFilters,
  getContentConfig,
  type ContentSection,
} from "@/lib/content-config"
import { copyConfig } from "@/lib/copy"
import { CourseAdapter, LessonAdapter, PurchaseAdapter, ResourceAdapter } from "@/lib/db-adapter"
import { NostrFetchService } from "@/lib/nostr-fetch-service"
import { getEventATag } from "@/lib/nostr-a-tag"
import { getNoteImage } from "@/lib/note-image"
import { resolvePreferredDisplayName } from "@/lib/profile-display"
import {
  createCourseDisplay,
  createResourceDisplay,
  parseCourseEvent,
  parseEvent,
  type ContentItem,
  type Course,
  type NostrEvent,
  type Resource,
} from "@/data/types"

interface GetContentCatalogDataOptions {
  viewerUserId?: string | null
  includeLessonVideos: boolean
  includeLessonDocuments: boolean
}

interface ContentCatalogData {
  items: ContentItem[]
  availableTags: string[]
}

type HomepageSectionItems = {
  courses: ContentItem[]
  videos: ContentItem[]
  documents: ContentItem[]
}

type PurchaseSummary = NonNullable<ContentItem["purchases"]>[number]

const COURSE_NOTE_KINDS = [30004, 30023, 30402]
const RESOURCE_NOTE_KINDS = [30023, 30402, 30403]
const CONTENT_TYPE_NAMES = new Set(["course", "video", "document", "courses", "videos", "documents"])

function normalizeOverlayPurchases(
  purchases: Awaited<ReturnType<typeof PurchaseAdapter.findByUserWithResourcesOrCourses>>
): {
  resources: Map<string, PurchaseSummary[]>
  courses: Map<string, PurchaseSummary[]>
} {
  const resources = new Map<string, PurchaseSummary[]>()
  const courses = new Map<string, PurchaseSummary[]>()

  purchases.forEach((purchase) => {
    const normalizedPurchase: PurchaseSummary = {
      id: purchase.id,
      amountPaid: purchase.amountPaid,
      priceAtPurchase: purchase.priceAtPurchase ?? undefined,
      createdAt: purchase.createdAt.toISOString(),
      updatedAt: purchase.updatedAt.toISOString(),
    }

    if (purchase.resourceId) {
      const existing = resources.get(purchase.resourceId) ?? []
      existing.push(normalizedPurchase)
      resources.set(purchase.resourceId, existing)
    }

    if (purchase.courseId) {
      const existing = courses.get(purchase.courseId) ?? []
      existing.push(normalizedPurchase)
      courses.set(purchase.courseId, existing)
    }
  })

  return { resources, courses }
}

function getFallbackResourceType(resource: Resource): "video" | "document" {
  return resource.videoId || resource.videoUrl ? "video" : "document"
}

function buildAvailableTags(items: ContentItem[]): string[] {
  const tagCounts = new Map<string, number>()

  items.forEach((item) => {
    item.topics.forEach((topic) => {
      const normalizedTopic = topic?.toLowerCase().trim()
      if (!normalizedTopic || CONTENT_TYPE_NAMES.has(normalizedTopic)) {
        return
      }

      tagCounts.set(normalizedTopic, (tagCounts.get(normalizedTopic) ?? 0) + 1)
    })
  })

  return Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
}

async function getLinkedResourceIds(): Promise<Set<string>> {
  return new Set(await LessonAdapter.getDistinctResourceIds())
}

function normalizeCourseItem(
  course: Course,
  note: NostrEvent | undefined,
  overlayPurchases: Map<string, PurchaseSummary[]>
): ContentItem {
  const parsedCourse = note ? parseCourseEvent(note) : null
  const display = parsedCourse
    ? createCourseDisplay(course, parsedCourse)
    : {
        title: `Course ${course.id}`,
        description: "",
        category: "general",
        instructor: "",
        instructorPubkey: course.user?.pubkey || "",
        rating: 0,
        enrollmentCount: 0,
        isPremium: course.price > 0,
        currency: "sats",
        image: "",
        tags: [] as string[][],
        published: true,
        topics: [] as string[],
        lessonReferences: [] as string[],
        additionalLinks: [],
        ...course,
      }
  const instructorPubkey = display.instructorPubkey || note?.pubkey || course.user?.pubkey || ""
  const instructor = resolvePreferredDisplayName({
    preferredNames: [display.instructor],
    user: course.user,
    pubkey: instructorPubkey,
  })

  return {
    id: course.id,
    type: "course",
    title: display.title,
    description: display.description,
    category: display.category || display.topics[0] || "general",
    image: display.image || getNoteImage(note),
    tags: display.tags,
    instructor,
    instructorPubkey,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    price: course.price,
    isPremium: course.price > 0,
    rating: 4.5,
    published: true,
    topics: display.topics,
    additionalLinks: display.additionalLinks ?? [],
    noteId: note?.id || course.noteId,
    noteATag: getEventATag(note),
    purchases: overlayPurchases.get(course.id) ?? course.purchases,
    currency: display.currency,
    enrollmentCount: display.enrollmentCount,
  }
}

function normalizeResourceItem(
  resource: Resource,
  note: NostrEvent | undefined,
  overlayPurchases: Map<string, PurchaseSummary[]>
): ContentItem {
  const parsedResource = note ? parseEvent(note) : null
  const fallbackType = getFallbackResourceType(resource)
  const display = parsedResource
    ? createResourceDisplay(resource, parsedResource)
    : {
        title: fallbackType === "video" ? `Video ${resource.id}` : `Document ${resource.id}`,
        description: "",
        category: "general",
        type: fallbackType,
        instructor: "",
        instructorPubkey: resource.user?.pubkey || "",
        rating: 0,
        viewCount: 0,
        isPremium: resource.price > 0,
        currency: "sats",
        image: "",
        tags: [] as string[],
        published: true,
        topics: [] as string[],
        additionalLinks: [],
        ...resource,
      }
  const instructorPubkey = display.instructorPubkey || note?.pubkey || resource.user?.pubkey || ""
  const instructor = resolvePreferredDisplayName({
    preferredNames: [display.instructor],
    user: resource.user,
    pubkey: instructorPubkey,
  })
  const fallbackImage =
    display.type === "video" && resource.videoId
      ? `https://img.youtube.com/vi/${resource.videoId}/hqdefault.jpg`
      : undefined

  return {
    id: resource.id,
    type: display.type,
    title: display.title,
    description: display.description,
    category: display.category || display.topics[0] || "general",
    image: display.image || getNoteImage(note, fallbackImage),
    tags: note?.tags || [],
    instructor,
    instructorPubkey,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
    price: resource.price,
    isPremium: resource.price > 0,
    rating: 4.5,
    published: true,
    topics: display.topics,
    additionalLinks: display.additionalLinks ?? [],
    noteId: note?.id || resource.noteId,
    noteATag: getEventATag(note),
    purchases: overlayPurchases.get(resource.id) ?? resource.purchases,
    currency: display.currency,
    viewCount: display.viewCount,
  }
}

export async function getContentCatalogData({
  viewerUserId,
  includeLessonVideos,
  includeLessonDocuments,
}: GetContentCatalogDataOptions): Promise<ContentCatalogData> {
  const includeAnyLessonResources = includeLessonVideos || includeLessonDocuments

  const [courses, resources] = await Promise.all([
    CourseAdapter.findAll(),
    ResourceAdapter.findAll({
      includeLessonResources: includeAnyLessonResources,
      userId: viewerUserId ?? undefined,
    }),
  ])

  const [courseNoteMap, resourceNoteMap, overlayPurchases, linkedResourceIds] = await Promise.all([
    courses.length > 0
      ? NostrFetchService.fetchEventsByDTags(courses.map((course) => course.id), COURSE_NOTE_KINDS)
      : Promise.resolve(new Map<string, NostrEvent>()),
    resources.length > 0
      ? NostrFetchService.fetchEventsByDTags(resources.map((resource) => resource.id), RESOURCE_NOTE_KINDS)
      : Promise.resolve(new Map<string, NostrEvent>()),
    viewerUserId
      ? PurchaseAdapter.findByUserWithResourcesOrCourses(
          viewerUserId,
          [],
          courses.map((course) => course.id)
        )
      : Promise.resolve([]),
    includeLessonVideos !== includeLessonDocuments && includeAnyLessonResources
      ? getLinkedResourceIds()
      : Promise.resolve(new Set<string>()),
  ])

  const normalizedOverlay = normalizeOverlayPurchases(overlayPurchases)

  const courseItems = courses.map((course) =>
    normalizeCourseItem(course, courseNoteMap.get(course.id), normalizedOverlay.courses)
  )

  const resourceItems = resources
    .map((resource) => normalizeResourceItem(resource, resourceNoteMap.get(resource.id), normalizedOverlay.resources))
    .filter((item) => {
      if (!linkedResourceIds.has(item.id)) {
        return true
      }

      if (item.type === "video" && !includeLessonVideos) {
        return false
      }

      if (item.type === "document" && !includeLessonDocuments) {
        return false
      }

      return true
    })

  const items = [...courseItems, ...resourceItems]

  return {
    items,
    availableTags: buildAvailableTags(items),
  }
}

export function sliceHomepageSections(items: ContentItem[]): HomepageSectionItems {
  const contentConfig = getContentConfig()
  const homepageConfig = contentConfig.homepage.sections

  const filterSection = (
    contentType: ContentItem["type"],
    config: ContentSection
  ): ContentItem[] => applyContentFilters(
    items.filter((item) => item.type === contentType),
    config.filters
  )

  return {
    courses: filterSection("course", homepageConfig.courses),
    videos: filterSection("video", homepageConfig.videos),
    documents: filterSection("document", homepageConfig.documents),
  }
}

export const contentCatalogCopy = {
  contentLibrary: copyConfig.contentLibrary,
  pricing: copyConfig.pricing,
}
