# API Patterns

Validation, error handling, and response utilities for pleb.school API routes. Located in `src/lib/api-utils.ts`.

## Validation Schemas

Zod schemas for request validation:

```typescript
import {
  CourseCreateSchema,
  CourseUpdateSchema,
  CourseFilterSchema,
  EnrollmentSchema,
  SearchSchema
} from '@/lib/api-utils'

// Course creation
const CourseCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  category: z.string().min(1),
  instructor: z.string().optional(),
  image: z.string().url().optional(),
})

// Query filters
const CourseFilterSchema = z.object({
  category: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  search: z.string().optional(),
})

// Server actions
const EnrollmentSchema = z.object({
  courseId: z.string().min(1),
  email: z.string().email().max(254),
})
```

## Error Classes

Structured error types with proper HTTP status codes:

```typescript
import {
  ApiError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError
} from '@/lib/api-utils'

// Base error
throw new ApiError(400, 'Bad request', 'BAD_REQUEST', { details })

// Specific errors
throw new ValidationError('Invalid input', { email: ['Invalid format'] })
throw new NotFoundError('Course')
throw new UnauthorizedError('Login required')
throw new ForbiddenError('Admin access required')
throw new ConflictError('Email already exists')
```

## Validation Helpers

```typescript
import { validateRequest, validateFormData, validateSearchParams } from '@/lib/api-utils'

// Validate JSON body
const result = validateRequest(CourseCreateSchema, await req.json())
if (!result.success) {
  return handleApiError(result.errors)
}
const data = result.data // Typed correctly

// Validate form data
const result = validateFormData(EnrollmentSchema, formData)

// Validate query params
const result = validateSearchParams(CourseFilterSchema, url.searchParams)
```

## Error Handling

Centralized error handler for API routes:

```typescript
import { handleApiError } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  try {
    // ... route logic
  } catch (error) {
    return handleApiError(error)
  }
}
```

Returns appropriate responses:
- `ApiError` subclasses: mapped status code + error details
- `ZodError`: 400 with field-level errors
- Unknown errors: 500 with generic message (logged server-side)

## Response Helpers

Consistent response formatting:

```typescript
import {
  successResponse,
  errorResponse,
  createdResponse,
  noContentResponse,
  paginatedResponse
} from '@/lib/api-utils'

// Success (200)
return successResponse(course, 'Course retrieved')

// Created (201)
return createdResponse(newCourse, 'Course created')

// No content (204)
return noContentResponse()

// Error
return errorResponse('Invalid request', 'INVALID_REQUEST', 400)

// Paginated
return paginatedResponse(courses, page, limit)
```

## Pagination

```typescript
import { paginateResults, PaginatedResponse } from '@/lib/api-utils'

// Manual pagination
const result: PaginatedResponse<Course> = paginateResults(allCourses, page, limit)
// Returns: { data, pagination: { page, limit, total, totalPages, hasNext, hasPrev } }
```

## Sanitization

Input sanitization utilities:

```typescript
import { sanitizeString, sanitizeEmail, sanitizeSearchQuery } from '@/lib/api-utils'

const cleanTitle = sanitizeString(userInput)      // Removes HTML, normalizes whitespace
const cleanEmail = sanitizeEmail(email)           // Lowercase, trimmed
const cleanQuery = sanitizeSearchQuery(search)    // Alphanumeric only, 100 char limit
```

## Example API Route

```typescript
import { NextRequest } from 'next/server'
import {
  validateSearchParams,
  CourseFilterSchema,
  handleApiError,
  successResponse,
  NotFoundError
} from '@/lib/api-utils'
import { CourseAdapter } from '@/lib/db-adapter'

export async function GET(req: NextRequest) {
  try {
    const validation = validateSearchParams(
      CourseFilterSchema,
      req.nextUrl.searchParams
    )

    if (!validation.success) {
      return handleApiError(validation.errors)
    }

    const { page = 1, limit = 20, category, search } = validation.data

    const { data, pagination } = await CourseAdapter.findAllPaginated({
      page,
      pageSize: limit
    })

    return successResponse({ data, pagination })
  } catch (error) {
    return handleApiError(error)
  }
}
```

## Type Exports

```typescript
export type CourseCreateData = z.infer<typeof CourseCreateSchema>
export type CourseUpdateData = z.infer<typeof CourseUpdateSchema>
export type CourseFilters = z.infer<typeof CourseFilterSchema>
export type EnrollmentData = z.infer<typeof EnrollmentSchema>
export type SearchData = z.infer<typeof SearchSchema>
```
