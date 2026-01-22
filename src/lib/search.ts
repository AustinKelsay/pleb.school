/**
 * Search utilities for content discovery
 * Provides keyword matching functionality for courses and resources
 */

import { Course, Resource } from '@/data/types'
import { CourseWithNote, ResourceWithNote } from '@/lib/db-adapter'
import { parseCourseEvent, parseEvent } from '@/data/types'
import { sanitizeContent } from '@/lib/content-utils'

/**
 * Escape special regex characters to prevent ReDoS attacks
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export type MatchedField = 'title' | 'description' | 'content' | 'tags'

export interface SearchResult {
  id: string
  type: 'course' | 'resource'
  title: string
  description: string
  category: string
  instructor: string
  image?: string
  rating: number
  price: number
  isPremium: boolean
  matchScore: number
  keyword: string // Store the original search keyword for highlighting
  tags?: string[] // All tags from Nostr events
  matchedFields?: MatchedField[] // Which fields contained the keyword (optional for legacy code paths)
  highlights: {
    title?: string
    description?: string
  }
}

/**
 * Calculate match score based on keyword relevance
 */
function calculateMatchScore(keyword: string, title: string, description: string): number {
  const lowerKeyword = keyword.toLowerCase()
  const lowerTitle = title.toLowerCase()
  const lowerDescription = description.toLowerCase()
  
  let score = 0
  
  // Exact match in title (highest score)
  if (lowerTitle === lowerKeyword) {
    score += 100
  }
  // Title starts with keyword
  else if (lowerTitle.startsWith(lowerKeyword)) {
    score += 50
  }
  // Title contains keyword
  else if (lowerTitle.includes(lowerKeyword)) {
    score += 30
  }
  
  // Description contains keyword
  if (lowerDescription.includes(lowerKeyword)) {
    // Count occurrences
    const matches = lowerDescription.match(new RegExp(escapeRegExp(lowerKeyword), 'g'))
    score += (matches?.length || 1) * 5
  }
  
  // Word boundary matches (whole word)
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegExp(lowerKeyword)}\\b`, 'i')
  if (wordBoundaryRegex.test(title)) {
    score += 20
  }
  if (wordBoundaryRegex.test(description)) {
    score += 10
  }
  
  return score
}

/**
 * Highlight matched keywords in text
 */
function highlightKeyword(text: string, keyword: string): string {
  if (!text || !keyword) return text
  
  const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

/**
 * Search courses by keyword
 */
export function searchCourses(courses: CourseWithNote[], keyword: string): SearchResult[] {
  if (!keyword || keyword.length < 3) return []
  
  const results: SearchResult[] = []
  
  for (const course of courses) {
    // Extract title and description from Nostr event if available
    let title = ''
    let description = ''
    
    if (course.note) {
      const parsedEvent = parseCourseEvent(course.note)
      title = parsedEvent.title || parsedEvent.name || ''
      description = parsedEvent.description || ''
    }
    
    // Skip if no title or description
    if (!title && !description) continue
    
    const score = calculateMatchScore(keyword, title, description)
    
    // Only include results with a score > 0
    if (score > 0) {
      const titleSanitized = sanitizeContent(title)
      const descriptionSanitized = sanitizeContent(description)
      
      results.push({
        id: course.id,
        type: 'course',
        title,
        description,
        category: course.note?.tags.find(t => t[0] === 'l')?.[1] || 'general',
        instructor: course.userId,
        image: course.note?.tags.find(t => t[0] === 'image')?.[1],
        rating: 0,
        price: course.price,
        isPremium: course.price > 0,
        matchScore: score,
        keyword,
        highlights: {
          title: highlightKeyword(titleSanitized, keyword),
          description: highlightKeyword(descriptionSanitized, keyword)
        }
      })
    }
  }
  
  return results
}

/**
 * Search resources by keyword
 */
export function searchResources(resources: ResourceWithNote[], keyword: string): SearchResult[] {
  if (!keyword || keyword.length < 3) return []
  
  const results: SearchResult[] = []
  
  for (const resource of resources) {
    // Extract title and description from Nostr event if available
    let title = ''
    let description = ''
    
    if (resource.note) {
      const parsedEvent = parseEvent(resource.note)
      title = parsedEvent.title || ''
      description = parsedEvent.summary || ''
    }
    
    // Skip if no title or description
    if (!title && !description) continue
    
    const score = calculateMatchScore(keyword, title, description)
    
    // Only include results with a score > 0
    if (score > 0) {
      const titleSanitized = sanitizeContent(title)
      const descriptionSanitized = sanitizeContent(description)
      
      results.push({
        id: resource.id,
        type: 'resource',
        title,
        description,
        category: resource.note?.tags.find(t => t[0] === 'l')?.[1] || 
                  resource.note?.tags.find(t => t[0] === 't')?.[1] || 'general',
        instructor: resource.userId,
        image: resource.note?.tags.find(t => t[0] === 'image')?.[1],
        rating: 0,
        price: resource.price,
        isPremium: resource.price > 0,
        matchScore: score,
        keyword,
        highlights: {
          title: highlightKeyword(titleSanitized, keyword),
          description: highlightKeyword(descriptionSanitized, keyword)
        }
      })
    }
  }
  
  return results
}

/**
 * Search all content (courses and resources) by keyword
 */
export function searchContent(
  courses: CourseWithNote[], 
  resources: ResourceWithNote[], 
  keyword: string
): SearchResult[] {
  if (!keyword || keyword.length < 3) return []
  
  const courseResults = searchCourses(courses, keyword)
  const resourceResults = searchResources(resources, keyword)
  
  // Combine and sort by match score (highest first)
  return [...courseResults, ...resourceResults].sort((a, b) => b.matchScore - a.matchScore)
}

/**
 * Get search suggestions based on partial keyword
 */
export function getSearchSuggestions(
  courses: CourseWithNote[], 
  resources: ResourceWithNote[], 
  partialKeyword: string,
  limit: number = 5
): string[] {
  if (!partialKeyword || partialKeyword.length < 2) return []
  
  const suggestions = new Set<string>()
  const lowerKeyword = partialKeyword.toLowerCase()
  
  // Extract titles from courses
  for (const course of courses) {
    if (course.note) {
      const parsedEvent = parseCourseEvent(course.note)
      const title = parsedEvent.title || parsedEvent.name || ''
      if (title.toLowerCase().includes(lowerKeyword)) {
        suggestions.add(title)
      }
    }
  }
  
  // Extract titles from resources
  for (const resource of resources) {
    if (resource.note) {
      const parsedEvent = parseEvent(resource.note)
      const title = parsedEvent.title || ''
      if (title.toLowerCase().includes(lowerKeyword)) {
        suggestions.add(title)
      }
    }
  }
  
  // Convert to array and limit results
  return Array.from(suggestions)
    .sort((a, b) => {
      // Prioritize titles that start with the keyword
      const aStarts = a.toLowerCase().startsWith(lowerKeyword)
      const bStarts = b.toLowerCase().startsWith(lowerKeyword)
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1
      return a.localeCompare(b)
    })
    .slice(0, limit)
}

/**
 * Filter search results by criteria
 */
export interface SearchFilters {
  category?: string
  priceRange?: {
    min: number
    max: number
  }
  type?: 'course' | 'resource'
  isPremium?: boolean
}

export function filterSearchResults(
  results: SearchResult[], 
  filters: SearchFilters
): SearchResult[] {
  return results.filter(result => {
    // Filter by type
    if (filters.type && result.type !== filters.type) {
      return false
    }
    
    // Filter by category
    if (filters.category && result.category !== filters.category) {
      return false
    }
    
    // Filter by price range
    if (filters.priceRange) {
      if (result.price < filters.priceRange.min || result.price > filters.priceRange.max) {
        return false
      }
    }
    
    // Filter by premium status
    if (filters.isPremium !== undefined && result.isPremium !== filters.isPremium) {
      return false
    }
    
    return true
  })
}
