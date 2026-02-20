'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import logger from '@/lib/logger'

/**
 * Server action for handling course enrollment
 * Demonstrates form actions with validation and revalidation
 */
export async function enrollInCourse(formData: FormData) {
  const courseId = formData.get('courseId')
  const userEmail = formData.get('email')

  // Validate form data
  if (!courseId || !userEmail) {
    return {
      error: 'Missing required fields',
      success: false,
    }
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(userEmail.toString())) {
    return {
      error: 'Invalid email format',
      success: false,
    }
  }

  try {
    // Simulate API call or database operation
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // In a real app, you'd save to database
    logger.debug('Enrolling user in course')

    // Revalidate the courses page to show updated data
    revalidatePath('/courses')
    
    return {
      success: true,
      message: 'Successfully enrolled in course!',
    }
  } catch (error) {
    console.error('Enrollment error:', error)
    return {
      error: 'Failed to enroll in course. Please try again.',
      success: false,
    }
  }
}

/**
 * Server action for newsletter signup
 * Demonstrates simple form handling with redirects
 */
export async function subscribeToNewsletter(formData: FormData) {
  const email = formData.get('email')

  if (!email) {
    return {
      error: 'Email is required',
      success: false,
    }
  }

  try {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500))
    
    logger.debug('Subscribing user to newsletter')

    // Redirect to success page
    redirect('/newsletter-success')
  } catch (error) {
    console.error('Newsletter subscription error:', error)
    return {
      error: 'Failed to subscribe. Please try again.',
      success: false,
    }
  }
}

/**
 * Server action for course search
 * Demonstrates server-side search with revalidation
 */
export async function searchCourses(formData: FormData) {
  const query = formData.get('query')
  const category = formData.get('category')

  if (!query) {
    return {
      error: 'Search query is required',
      success: false,
      results: [],
    }
  }

  try {
    // Simulate search operation
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Mock search results
    const mockResults = [
      { id: 1, title: 'React Fundamentals', category: 'frontend' },
      { id: 2, title: 'Node.js API Development', category: 'backend' },
      { id: 3, title: 'TypeScript Basics', category: 'programming' },
    ]

    const filteredResults = mockResults.filter(course => 
      course.title.toLowerCase().includes(query.toString().toLowerCase()) &&
      (!category || course.category === category)
    )

    return {
      success: true,
      results: filteredResults,
      query: query.toString(),
    }
  } catch (error) {
    console.error('Search error:', error)
    return {
      error: 'Search failed. Please try again.',
      success: false,
      results: [],
    }
  }
}

/**
 * Server action for course rating
 * Demonstrates optimistic updates with revalidation
 */
export async function rateCourse(formData: FormData) {
  const courseId = formData.get('courseId')
  const rating = formData.get('rating')
  const comment = formData.get('comment')

  if (!courseId || !rating) {
    return {
      error: 'Course ID and rating are required',
      success: false,
    }
  }

  const ratingNum = parseInt(rating.toString())
  if (ratingNum < 1 || ratingNum > 5) {
    return {
      error: 'Rating must be between 1 and 5',
      success: false,
    }
  }

  try {
    // Simulate database operation
    await new Promise(resolve => setTimeout(resolve, 800))
    
    logger.debug('Submitting course rating')

    // Revalidate specific course page
    revalidatePath(`/courses/${courseId}`)
    
    return {
      success: true,
      message: 'Thank you for your rating!',
    }
  } catch (error) {
    console.error('Rating error:', error)
    return {
      error: 'Failed to submit rating. Please try again.',
      success: false,
    }
  }
} 
