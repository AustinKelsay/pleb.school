/**
 * API validation utilities and error handling for pleb.school
 * Provides consistent validation, error handling, and response formatting
 */

import { z } from 'zod'
import { NextResponse } from 'next/server'

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const CourseCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().min(1, 'Description is required').max(2000, 'Description too long'),
  category: z.string().min(1, 'Category is required'),
  instructor: z.string().optional(),
  image: z.string().url().optional(),
})

export const CourseUpdateSchema = CourseCreateSchema.partial()

export const CourseFilterSchema = z.object({
  category: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  search: z.string().optional(),
})

export const CourseIdSchema = z.object({
  id: z.string().transform((val) => {
    const num = parseInt(val)
    if (isNaN(num) || num <= 0) {
      throw new Error('Invalid course ID')
    }
    return num
  })
})

// Server action schemas
export const EnrollmentSchema = z.object({
  courseId: z.string().min(1, 'Course ID is required'),
  email: z.email().max(254, 'Email too long'),
})

export const NewsletterSchema = z.object({
  email: z.email().max(254, 'Email too long'),
})

export const RatingSchema = z.object({
  courseId: z.string().min(1, 'Course ID is required'),
  rating: z.coerce.number().min(1, 'Rating must be at least 1').max(5, 'Rating must be at most 5'),
})

export const SearchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  category: z.string().optional(),
  type: z.enum(['course', 'document', 'video']).optional(),
})

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, public fieldErrors?: Record<string, string[]>) {
    super(400, message, 'VALIDATION_ERROR', { fieldErrors })
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(401, message, 'UNAUTHORIZED')
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Access forbidden') {
    super(403, message, 'FORBIDDEN')
    this.name = 'ForbiddenError'
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Resource conflict') {
    super(409, message, 'CONFLICT')
    this.name = 'ConflictError'
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validateCourseId(id: string): { success: true; courseId: number } | { success: false; error: string } {
  try {
    const result = CourseIdSchema.parse({ id })
    return { success: true, courseId: result.id }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || 'Invalid course ID' }
    }
    return { success: false, error: 'Invalid course ID format' }
  }
}

export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, errors: result.error }
}

export function validateFormData<T>(
  schema: z.ZodSchema<T>,
  formData: FormData
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const data = Object.fromEntries(formData.entries())
  return validateRequest(schema, data)
}

export function validateSearchParams<T>(
  schema: z.ZodSchema<T>,
  searchParams: URLSearchParams
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const data = Object.fromEntries(searchParams.entries())
  return validateRequest(schema, data)
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export function handleApiError(error: unknown): NextResponse {
  console.error('API Error:', error)

  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details && { details: error.details })
      },
      { status: error.statusCode }
    )
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: {
          fieldErrors: error.flatten().fieldErrors,
          formErrors: error.flatten().formErrors
        }
      },
      { status: 400 }
    )
  }

  // Log unexpected errors for debugging
  console.error('Unexpected API error:', error)

  return NextResponse.json(
    {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    },
    { status: 500 }
  )
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

export function successResponse<T>(data: T, message?: string, status: number = 200): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(message && { message })
    },
    { status }
  )
}

export function errorResponse(
  message: string,
  code?: string,
  status: number = 400,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(code && { code }),
      ...(details && { details })
    },
    { status }
  )
}

export function createdResponse<T>(data: T, message?: string): NextResponse {
  return successResponse(data, message, 201)
}

export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

// ============================================================================
// PAGINATION HELPERS
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export function paginateResults<T>(
  data: T[],
  page: number,
  limit: number
): PaginatedResponse<T> {
  const total = data.length
  const totalPages = Math.ceil(total / limit)
  const startIndex = (page - 1) * limit
  const endIndex = startIndex + limit
  const paginatedData = data.slice(startIndex, endIndex)

  return {
    data: paginatedData,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  }
}

export function paginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  message?: string
): NextResponse {
  const result = paginateResults(data, page, limit)
  return successResponse(result, message)
}

// ============================================================================
// SANITIZATION HELPERS
// ============================================================================

export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

export function sanitizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/[^\w\s-]/g, '') // Only allow alphanumeric, spaces, and hyphens
    .replace(/\s+/g, ' ')
    .substring(0, 100) // Limit length
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type CourseCreateData = z.infer<typeof CourseCreateSchema>
export type CourseUpdateData = z.infer<typeof CourseUpdateSchema>
export type CourseFilters = z.infer<typeof CourseFilterSchema>
export type EnrollmentData = z.infer<typeof EnrollmentSchema>
export type NewsletterData = z.infer<typeof NewsletterSchema>
export type RatingData = z.infer<typeof RatingSchema>
export type SearchData = z.infer<typeof SearchSchema>
