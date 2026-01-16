/**
 * Content Index
 *
 * Exports all seed content definitions for use in the seed script.
 */

export { WELCOME_COURSE, type CourseDefinition, type LessonDefinition } from './welcome-course'
export { ZAPS_COURSE } from './zaps-course'
export { STANDALONE_RESOURCES, type StandaloneResource } from './standalone'

// Aggregate all courses
import { WELCOME_COURSE } from './welcome-course'
import { ZAPS_COURSE } from './zaps-course'
import type { CourseDefinition } from './welcome-course'

export const ALL_COURSES: CourseDefinition[] = [WELCOME_COURSE, ZAPS_COURSE]

// Aggregate all standalone resources
import { STANDALONE_RESOURCES } from './standalone'
import type { StandaloneResource } from './standalone'

export const ALL_STANDALONE: StandaloneResource[] = STANDALONE_RESOURCES
