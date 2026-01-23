import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CourseAdapter, ResourceAdapter } from '@/lib/db-adapter'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma'

type PublishedContentType = 'all' | 'courses' | 'resources'

const DEFAULT_LIMIT = 200

function parseLimit(param: string | null): number | undefined {
  if (!param) return undefined
  const parsed = Number.parseInt(param, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined
  }
  return Math.min(parsed, DEFAULT_LIMIT)
}

function toPublishedContentType(param: string | null): PublishedContentType {
  if (!param) return 'all'
  if (param === 'courses' || param === 'resources') {
    return param
  }
  return 'all'
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    const limit = parseLimit(searchParams.get('limit'))
    const type = toPublishedContentType(searchParams.get('type'))

    const fetchResources = type === 'all' || type === 'resources'
    const fetchCourses = type === 'all' || type === 'courses'

    const [resources, courses] = await Promise.all([
      fetchResources ? ResourceAdapter.findByUserId(userId) : Promise.resolve([]),
      fetchCourses ? CourseAdapter.findByUserId(userId) : Promise.resolve([]),
    ])

    const limitedResources = typeof limit === 'number' ? resources.slice(0, limit) : resources
    const limitedCourses = typeof limit === 'number' ? courses.slice(0, limit) : courses

    const resourceIds = resources.map(resource => resource.id)
    const courseIds = courses.map(course => course.id)

    const purchaseFilters: Prisma.PurchaseWhereInput[] = []

    if (resourceIds.length) {
      purchaseFilters.push({ resourceId: { in: resourceIds } })
    }
    if (courseIds.length) {
      purchaseFilters.push({ courseId: { in: courseIds } })
    }

    const purchaseWhere: Prisma.PurchaseWhereInput | undefined = purchaseFilters.length
      ? { OR: purchaseFilters }
      : undefined

    const [purchaseAggregate, purchaseCount] = purchaseWhere
      ? await Promise.all([
          prisma.purchase.aggregate({
            _sum: { amountPaid: true },
            where: purchaseWhere,
          }),
          prisma.purchase.count({
            where: purchaseWhere,
          }),
        ])
      : [{ _sum: { amountPaid: null } }, 0] as const

    let paidResources = 0
    let freeResources = 0
    let paidCourses = 0
    let freeCourses = 0
    let latestTimestamp = 0
    let latestIso: string | null = null

    const updateLatest = (iso?: string) => {
      if (!iso) return
      const timestamp = Date.parse(iso)
      if (Number.isNaN(timestamp)) return
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp
        latestIso = iso
      }
    }

    for (const resource of resources) {
      if (resource.price > 0) {
        paidResources += 1
      } else {
        freeResources += 1
      }
      updateLatest(resource.updatedAt)
    }

    for (const course of courses) {
      if (course.price > 0) {
        paidCourses += 1
      } else {
        freeCourses += 1
      }
      updateLatest(course.updatedAt)
    }

    const stats = {
      totalResources: resources.length,
      totalCourses: courses.length,
      paidResources,
      freeResources,
      paidCourses,
      freeCourses,
      totalPurchases: purchaseCount,
      totalRevenueSats: purchaseAggregate._sum.amountPaid ?? 0,
      lastUpdatedAt: latestIso,
    }

    return NextResponse.json({
      success: true,
      data: {
        resources: limitedResources,
        courses: limitedCourses,
        stats,
      },
    })
  } catch (error) {
    console.error('Failed to fetch published content for profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch published content' },
      { status: 500 }
    )
  }
}
