import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  findResourceByIdMock,
  findResourceByIdWithNoteMock,
  courseExistsMock,
  findCourseByIdWithNoteMock,
} = vi.hoisted(() => ({
  findResourceByIdMock: vi.fn(),
  findResourceByIdWithNoteMock: vi.fn(),
  courseExistsMock: vi.fn(),
  findCourseByIdWithNoteMock: vi.fn(),
}))

vi.mock('@/lib/db-adapter', () => ({
  ResourceAdapter: {
    findById: findResourceByIdMock,
    findByIdWithNote: findResourceByIdWithNoteMock,
  },
  CourseAdapter: {
    exists: courseExistsMock,
    findByIdWithNote: findCourseByIdWithNoteMock,
  },
}))

import { metadata as contentMetadata } from '@/app/content/[id]/layout'
import { generateMetadata as generateCourseMetadata } from '@/app/courses/[id]/layout'

describe('route metadata generation', () => {
  beforeEach(() => {
    findResourceByIdMock.mockReset()
    findResourceByIdWithNoteMock.mockReset()
    courseExistsMock.mockReset()
    findCourseByIdWithNoteMock.mockReset()
  })

  it('uses generic content metadata without querying the database', () => {
    expect(contentMetadata.title).toBe('Content | pleb.school')
    expect(findResourceByIdMock).not.toHaveBeenCalled()
    expect(findResourceByIdWithNoteMock).not.toHaveBeenCalled()
  })

  it('uses generic course metadata without querying the database', () => {
    const metadata = generateCourseMetadata()

    expect(courseExistsMock).not.toHaveBeenCalled()
    expect(findCourseByIdWithNoteMock).not.toHaveBeenCalled()
    expect(metadata.title).toBe('Course | pleb.school')
  })
})
