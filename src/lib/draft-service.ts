/**
 * Draft Service - Database operations for draft content
 * Handles CRUD operations for draft courses, resources, and lessons
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma'
import { normalizeAdditionalLinks } from '@/lib/additional-links'
import type { AdditionalLink } from '@/types/additional-links'

// Types for draft operations
export interface CreateCourseDraftData {
  title: string
  summary: string
  image?: string
  price?: number
  topics: string[]
  userId: string
}

export interface UpdateCourseDraftData {
  title?: string
  summary?: string
  image?: string
  price?: number
  topics?: string[]
}

export interface CreateDraftData {
  type: string
  title: string
  summary: string
  content: string
  image?: string
  price?: number
  topics: string[]
  additionalLinks?: AdditionalLink[]
  videoUrl?: string
  userId: string
}

export interface UpdateDraftData {
  type?: string
  title?: string
  summary?: string
  content?: string
  image?: string
  price?: number
  topics?: string[]
  additionalLinks?: AdditionalLink[]
  videoUrl?: string
}

export interface CreateDraftLessonData {
  courseDraftId: string
  resourceId?: string
  draftId?: string
  index: number
}

export interface UpdateDraftLessonData {
  index?: number
}

export interface PaginationOptions {
  page?: number
  pageSize?: number
  userId?: string
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

function withNormalizedAdditionalLinks<T extends { additionalLinks?: unknown }>(
  draft: T
): T & { additionalLinks: AdditionalLink[] } {
  const normalizedLinks = normalizeAdditionalLinks((draft as any)?.additionalLinks)
  return {
    ...draft,
    additionalLinks: normalizedLinks,
  }
}

function toAdditionalLinksJson(links: AdditionalLink[]): Prisma.JsonArray {
  return links.map(link => {
    const entry: Prisma.JsonObject = { url: link.url }
    if (link.title) {
      entry.title = link.title
    }
    return entry
  })
}

// Type for course draft with includes
export type CourseDraftWithIncludes = Prisma.CourseDraftGetPayload<{
  include: {
    draftLessons: {
      orderBy: {
        index: 'asc'
      }
      include: {
        resource: {
          include: {
            user: {
              select: {
                id: true
                username: true
                pubkey: true
              }
            }
          }
        }
        draft: true
      }
    }
    user: {
      select: {
        id: true
        username: true
        email: true
        pubkey: true
      }
    }
  }
}>

// Type for draft with includes
export type DraftWithIncludes = Prisma.DraftGetPayload<{
  include: {
    draftLessons: {
      orderBy: {
        index: 'asc'
      }
    }
    lessons: {
      orderBy: {
        index: 'asc'
      }
    }
    user: {
      select: {
        id: true
        username: true
        email: true
      }
    }
  }
}>

/**
 * Course Draft Service
 */
export class CourseDraftService {
  /**
   * Create a new course draft
   */
  static async create(data: CreateCourseDraftData) {
    return await prisma.courseDraft.create({
      data: {
        title: data.title,
        summary: data.summary,
        image: data.image,
        price: data.price || 0,
        topics: data.topics,
        userId: data.userId,
      },
      include: {
        draftLessons: {
          orderBy: {
            index: 'asc'
          },
          include: {
            resource: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    pubkey: true
                  }
                }
              }
            },
            draft: true
          }
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            pubkey: true
          }
        }
      }
    })
  }

  /**
   * Get all course drafts with pagination
   */
  static async findAll(options: PaginationOptions = {}): Promise<PaginatedResult<CourseDraftWithIncludes>> {
    const page = options.page || 1
    const pageSize = options.pageSize || 10
    const skip = (page - 1) * pageSize

    const where: Prisma.CourseDraftWhereInput = {}
    if (options.userId) {
      where.userId = options.userId
    }

    const [data, total] = await Promise.all([
      prisma.courseDraft.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          updatedAt: 'desc'
        },
        include: {
          draftLessons: {
            orderBy: {
              index: 'asc'
            },
            include: {
              resource: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      pubkey: true
                    }
                  }
                }
              },
              draft: true
            }
          },
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              pubkey: true
            }
          }
        }
      }),
      prisma.courseDraft.count({ where })
    ])

    return {
      data,
      pagination: {
        page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: page < Math.ceil(total / pageSize),
        hasPrev: page > 1
      }
    }
  }

  /**
   * Get a course draft by ID
   */
  static async findById(id: string) {
    return await prisma.courseDraft.findUnique({
      where: { id },
      include: {
        draftLessons: {
          orderBy: {
            index: 'asc'
          },
          include: {
            resource: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    pubkey: true
                  }
                }
              }
            },
            draft: true
          }
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            pubkey: true
          }
        }
      }
    })
  }

  static async syncPublishedLessons(courseDraftId: string) {
    await prisma.$transaction(async (tx) => {
      const lessonsWithResources = await tx.draftLesson.findMany({
        where: {
          courseDraftId,
          resourceId: { not: null },
        },
        select: {
          resourceId: true,
        },
      })

      const assignedResourceIds = new Set<string>(
        lessonsWithResources
          .map((lesson) => lesson.resourceId)
          .filter((resourceId): resourceId is string => Boolean(resourceId))
      )
      const skippedDuplicates: string[] = []

      const lessonsNeedingSync = await tx.draftLesson.findMany({
        where: {
          courseDraftId,
          resourceId: null,
          draftId: { not: null },
        },
        select: {
          id: true,
          draftId: true,
        },
      })

      if (!lessonsNeedingSync.length) {
        return
      }

      for (const lesson of lessonsNeedingSync) {
        if (!lesson.draftId) {
          continue
        }

        // Find the published Resource where the Resource ID equals the draft ID
        // (when a Draft is published, the Resource uses the Draft's ID)
        const resource = await tx.resource.findFirst({
          where: { id: lesson.draftId },
          select: { id: true },
        })

        if (resource) {
          if (assignedResourceIds.has(resource.id)) {
            skippedDuplicates.push(lesson.id)
            continue
          }

          await tx.draftLesson.update({
            where: { id: lesson.id },
            data: {
              resourceId: resource.id,
              draftId: null,
            },
          })

          assignedResourceIds.add(resource.id)
        }
      }

      if (skippedDuplicates.length > 0) {
        console.warn(
          `[CourseDraftService.syncPublishedLessons] Skipped syncing duplicate lessons for courseDraftId=${courseDraftId}. Affected draft lesson IDs:`,
          skippedDuplicates
        )
      }
    })
  }

  /**
   * Update a course draft
   */
  static async update(id: string, data: UpdateCourseDraftData) {
    return await prisma.courseDraft.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.summary && { summary: data.summary }),
        ...(data.image !== undefined && { image: data.image }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.topics && { topics: data.topics }),
        updatedAt: new Date()
      },
      include: {
        draftLessons: {
          orderBy: {
            index: 'asc'
          },
          include: {
            resource: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    pubkey: true
                  }
                }
              }
            },
            draft: true
          }
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            pubkey: true
          }
        }
      }
    })
  }

  /**
   * Delete a course draft
   */
  static async delete(id: string) {
    // Delete associated draft lessons first
    await prisma.draftLesson.deleteMany({
      where: { courseDraftId: id }
    })

    return await prisma.courseDraft.delete({
      where: { id }
    })
  }
}

/**
 * Draft Service (for resources)
 */
export class DraftService {
  /**
   * Create a new draft
   */
  static async create(data: CreateDraftData) {
    const additionalLinks = normalizeAdditionalLinks(data.additionalLinks)
    const additionalLinksJson = toAdditionalLinksJson(additionalLinks)

    return await prisma.draft.create({
      data: {
        type: data.type,
        title: data.title,
        summary: data.summary,
        content: data.content,
        image: data.image,
        price: data.price || 0,
        topics: data.topics,
        additionalLinks: additionalLinksJson,
        videoUrl: data.videoUrl,
        userId: data.userId,
      },
      include: {
        draftLessons: {
          orderBy: {
            index: 'asc'
          }
        },
        lessons: {
          orderBy: {
            index: 'asc'
          }
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    }).then(withNormalizedAdditionalLinks)
  }

  /**
   * Get all drafts with pagination
   */
  static async findAll(options: PaginationOptions = {}): Promise<PaginatedResult<DraftWithIncludes>> {
    const page = options.page || 1
    const pageSize = options.pageSize || 10
    const skip = (page - 1) * pageSize

    const where: Prisma.DraftWhereInput = {}
    if (options.userId) {
      where.userId = options.userId
    }

    const [rawData, total] = await Promise.all([
      prisma.draft.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          updatedAt: 'desc'
        },
        include: {
          draftLessons: {
            orderBy: {
              index: 'asc'
            }
          },
          lessons: {
            orderBy: {
              index: 'asc'
            }
          },
          user: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        }
      }),
      prisma.draft.count({ where })
    ])

    const data = rawData.map(withNormalizedAdditionalLinks)

    return {
      data,
      pagination: {
        page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: page < Math.ceil(total / pageSize),
        hasPrev: page > 1
      }
    }
  }

  /**
   * Get a draft by ID
   */
  static async findById(id: string) {
    return await prisma.draft.findUnique({
      where: { id },
      include: {
        draftLessons: {
          orderBy: {
            index: 'asc'
          }
        },
        lessons: {
          orderBy: {
            index: 'asc'
          }
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    }).then(draft => (draft ? withNormalizedAdditionalLinks(draft) : draft))
  }

  /**
   * Update a draft
   */
  static async update(id: string, data: UpdateDraftData) {
    const hasAdditionalLinks = data.additionalLinks !== undefined
    const additionalLinksJson = hasAdditionalLinks
      ? toAdditionalLinksJson(normalizeAdditionalLinks(data.additionalLinks))
      : undefined

    return await prisma.draft.update({
      where: { id },
      data: {
        ...(data.type !== undefined && { type: data.type }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.summary !== undefined && { summary: data.summary }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.image !== undefined && { image: data.image }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.topics !== undefined && { topics: data.topics }),
        ...(hasAdditionalLinks && { additionalLinks: additionalLinksJson }),
        ...(data.videoUrl !== undefined && { videoUrl: data.videoUrl }),
        updatedAt: new Date()
      },
      include: {
        draftLessons: {
          orderBy: {
            index: 'asc'
          }
        },
        lessons: {
          orderBy: {
            index: 'asc'
          }
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    }).then(withNormalizedAdditionalLinks)
  }

  /**
   * Delete a draft
   */
  static async delete(id: string) {
    // Delete associated draft lessons first
    await prisma.draftLesson.deleteMany({
      where: { draftId: id }
    })

    // Delete associated lessons
    await prisma.lesson.deleteMany({
      where: { draftId: id }
    })

    return await prisma.draft.delete({
      where: { id }
    })
  }
}

/**
 * Draft Lesson Service
 */
export class DraftLessonService {
  /**
   * Create a new draft lesson
   */
  static async create(data: CreateDraftLessonData) {
    return await prisma.draftLesson.create({
      data: {
        courseDraftId: data.courseDraftId,
        resourceId: data.resourceId,
        draftId: data.draftId,
        index: data.index,
      },
      include: {
        courseDraft: true,
        resource: true,
        draft: true
      }
    })
  }

  /**
   * Get all draft lessons for a course draft
   */
  static async findByCourseDraftId(courseDraftId: string) {
    return await prisma.draftLesson.findMany({
      where: { courseDraftId },
      orderBy: {
        index: 'asc'
      },
      include: {
        courseDraft: true,
        resource: true,
        draft: true
      }
    })
  }

  /**
   * Get a draft lesson by ID
   */
  static async findById(id: string) {
    return await prisma.draftLesson.findUnique({
      where: { id },
      include: {
        courseDraft: true,
        resource: true,
        draft: true
      }
    })
  }

  /**
   * Update a draft lesson
   */
  static async update(id: string, data: UpdateDraftLessonData) {
    return await prisma.draftLesson.update({
      where: { id },
      data: {
        ...(data.index !== undefined && { index: data.index }),
        updatedAt: new Date()
      },
      include: {
        courseDraft: true,
        resource: true,
        draft: true
      }
    })
  }

  /**
   * Delete a draft lesson
   */
  static async delete(id: string) {
    return await prisma.draftLesson.delete({
      where: { id }
    })
  }

  /**
   * Reorder draft lessons within a course draft
   */
  static async reorder(_courseDraftId: string, lessonIds: string[]) {
    const updates = lessonIds.map((lessonId, index) =>
      prisma.draftLesson.update({
        where: { id: lessonId },
        data: { index }
      })
    )

    return await prisma.$transaction(updates)
  }
}
