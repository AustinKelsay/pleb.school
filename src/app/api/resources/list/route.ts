import { NextRequest, NextResponse } from 'next/server'
import { ResourceAdapter } from '@/lib/db-adapter'
import { parseOptionalPositiveInt, PUBLIC_LIST_CACHE_CONTROL } from '@/lib/api-utils'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = searchParams.get('page')
    const pageSize = searchParams.get('pageSize')
    // Optional flag that allows consumers (e.g. lesson selector) to include
    // resources that are already attached to a course lesson. Defaults to false
    // to preserve the original standalone library behaviour.
    const includeLessonResourcesParam = searchParams.get('includeLessonResources')
    const includeLessonResources = includeLessonResourcesParam === 'true' || includeLessonResourcesParam === '1'

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
      })

      return NextResponse.json(
        {
          data: result.data,
          pagination: result.pagination,
        },
        {
          headers: {
            'Cache-Control': PUBLIC_LIST_CACHE_CONTROL,
          },
        }
      )
    }

    const resources = await ResourceAdapter.findAll({ includeLessonResources })

    return NextResponse.json(
      {
        resources,
      },
      {
        headers: {
          'Cache-Control': PUBLIC_LIST_CACHE_CONTROL,
        },
      }
    )
  } catch (error) {
    console.error('Failed to fetch resources:', error)
    return NextResponse.json(
      { error: 'Failed to fetch resources' },
      { status: 500 }
    )
  }
}
