import {
  applyContentFilters,
  getContentConfig,
  type ContentSection,
} from "@/lib/content-config"
import {
  applyResolvedNoteToContentItem,
  resolveCatalogEventsByIdentity,
} from "@/lib/content-note-resolution"
import { copyConfig } from "@/lib/copy"
import { CourseAdapter, LessonAdapter, PurchaseAdapter, ResourceAdapter } from "@/lib/db-adapter"
import { resolvePreferredDisplayName } from "@/lib/profile-display"
import {
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
  resolved: { note?: NostrEvent; noteResolved: boolean },
  overlayPurchases: Map<string, PurchaseSummary[]>
): ContentItem {
  const instructorPubkey = course.user?.pubkey || ""
  const instructor = resolvePreferredDisplayName({
    preferredNames: [],
    user: course.user,
    pubkey: instructorPubkey,
  })

  const baseItem: ContentItem = {
    id: course.id,
    type: "course",
    title: `Course ${course.id}`,
    description: "",
    category: "general",
    image: undefined,
    tags: [],
    instructor,
    instructorPubkey,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    price: course.price,
    isPremium: course.price > 0,
    rating: 4.5,
    published: true,
    topics: [],
    additionalLinks: [],
    noteId: course.noteId,
    purchases: overlayPurchases.get(course.id) ?? course.purchases,
    currency: "sats",
    enrollmentCount: 0,
    noteResolved: resolved.noteResolved,
  }

  return resolved.note ? applyResolvedNoteToContentItem(baseItem, resolved.note) : baseItem
}

function normalizeResourceItem(
  resource: Resource,
  resolved: { note?: NostrEvent; noteResolved: boolean },
  overlayPurchases: Map<string, PurchaseSummary[]>
): ContentItem {
  const fallbackType = getFallbackResourceType(resource)
  const instructorPubkey = resource.user?.pubkey || ""
  const instructor = resolvePreferredDisplayName({
    preferredNames: [],
    user: resource.user,
    pubkey: instructorPubkey,
  })
  const fallbackImage =
    fallbackType === "video" && resource.videoId
      ? `https://img.youtube.com/vi/${resource.videoId}/hqdefault.jpg`
      : undefined

  const baseItem: ContentItem = {
    id: resource.id,
    type: fallbackType,
    title: fallbackType === "video" ? `Video ${resource.id}` : `Document ${resource.id}`,
    description: "",
    category: "general",
    image: fallbackImage,
    tags: [],
    instructor,
    instructorPubkey,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
    price: resource.price,
    isPremium: resource.price > 0,
    rating: 4.5,
    published: true,
    topics: [],
    additionalLinks: [],
    noteId: resource.noteId,
    purchases: overlayPurchases.get(resource.id) ?? resource.purchases,
    currency: "sats",
    viewCount: 0,
    noteResolved: resolved.noteResolved,
  }

  return resolved.note ? applyResolvedNoteToContentItem(baseItem, resolved.note) : baseItem
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

  const [courseResolution, resourceResolution, overlayPurchases, linkedResourceIds] = await Promise.all([
    courses.length > 0
      ? resolveCatalogEventsByIdentity(
          courses.map((course) => ({
            id: course.id,
            noteId: course.noteId,
            type: "course",
          })),
          COURSE_NOTE_KINDS
        )
      : Promise.resolve({
          eventsByEntityId: new Map(),
          unresolvedEntityIds: new Set<string>(),
        }),
    resources.length > 0
      ? resolveCatalogEventsByIdentity(
          resources.map((resource) => ({
            id: resource.id,
            noteId: resource.noteId,
            type: getFallbackResourceType(resource),
          })),
          RESOURCE_NOTE_KINDS
        )
      : Promise.resolve({
          eventsByEntityId: new Map(),
          unresolvedEntityIds: new Set<string>(),
        }),
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
    normalizeCourseItem(
      course,
      {
        note: courseResolution.eventsByEntityId.get(course.id),
        noteResolved: !courseResolution.unresolvedEntityIds.has(course.id),
      },
      normalizedOverlay.courses
    )
  )

  const resourceItems = resources
    .map((resource) =>
      normalizeResourceItem(
        resource,
        {
          note: resourceResolution.eventsByEntityId.get(resource.id),
          noteResolved: !resourceResolution.unresolvedEntityIds.has(resource.id),
        },
        normalizedOverlay.resources
      )
    )
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
