import { NextRequest, NextResponse } from 'next/server'
import { CourseAdapter } from '@/lib/db-adapter'

const PUBLIC_LIST_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = searchParams.get('page')
    const pageSize = searchParams.get('pageSize')
    
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
      const result = await CourseAdapter.findAllPaginated({
        page: parsedPage,
        pageSize: parsedPageSize
      })
      return NextResponse.json(
        result,
        {
          headers: {
            'Cache-Control': PUBLIC_LIST_CACHE_CONTROL,
          },
        }
      )
    }

    const courses = await CourseAdapter.findAll()
    return NextResponse.json(
      { courses },
      {
        headers: {
          'Cache-Control': PUBLIC_LIST_CACHE_CONTROL,
        },
      }
    )
  } catch (error) {
    console.error('Failed to fetch courses:', error)
    return NextResponse.json(
      { error: 'Failed to fetch courses' },
      { status: 500 }
    )
  }
}
