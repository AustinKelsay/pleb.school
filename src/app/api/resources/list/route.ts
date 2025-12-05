import { NextRequest, NextResponse } from 'next/server'
import { ResourceAdapter } from '@/lib/db-adapter'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const searchParams = request.nextUrl.searchParams
    const page = searchParams.get('page')
    const pageSize = searchParams.get('pageSize')
    // Optional flag that allows consumers (e.g. lesson selector) to include
    // resources that are already attached to a course lesson. Defaults to false
    // to preserve the original standalone library behaviour.
    const includeLessonResourcesParam = searchParams.get('includeLessonResources')
    const includeLessonResources = includeLessonResourcesParam === 'true' || includeLessonResourcesParam === '1'

    const parseOptionalPositiveInt = (value: string | null) => {
      if (value === null) return undefined
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
        return null
      }
      return parsed
    }

    const parsedPage = parseOptionalPositiveInt(page)
    if (parsedPage === null) {
      return NextResponse.json(
        { error: 'Invalid page parameter: must be a positive integer.' },
        { status: 400 }
      )
    }

    const parsedPageSize = parseOptionalPositiveInt(pageSize)
    if (parsedPageSize === null) {
      return NextResponse.json(
        { error: 'Invalid pageSize parameter: must be a positive integer.' },
        { status: 400 }
      )
    }

    if (parsedPage !== undefined || parsedPageSize !== undefined) {
      const result = await ResourceAdapter.findAllPaginated({
        page: parsedPage,
        pageSize: parsedPageSize,
        includeLessonResources,
        userId: session?.user?.id,
      })

      return NextResponse.json({
        data: result.data,
        pagination: result.pagination,
      })
    }

    const resources = await ResourceAdapter.findAll({ includeLessonResources, userId: session?.user?.id })

    return NextResponse.json({
      resources,
    })
  } catch (error) {
    console.error('Failed to fetch resources:', error)
    return NextResponse.json(
      { error: 'Failed to fetch resources' },
      { status: 500 }
    )
  }
}
