/**
 * Logging utility with environment-aware log levels.
 *
 * - debug: Only logs in development (verbose debugging info)
 * - info: General information (always logs)
 * - warn: Warnings (always logs)
 * - error: Errors (always logs)
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.debug('Verbose debug info', { data })
 *   logger.info('General info')
 *   logger.warn('Warning message')
 *   logger.error('Error occurred', error)
 */

const isDev = process.env.NODE_ENV === 'development'

export const logger = {
  /**
   * Debug logging - only outputs in development environment.
   * Use for verbose debugging information that shouldn't appear in production logs.
   */
  debug: (...args: unknown[]): void => {
    if (isDev) {
      console.log('[DEBUG]', ...args)
    }
  },

  /**
   * Info logging - always outputs.
   * Use for general operational information.
   */
  info: (...args: unknown[]): void => {
    console.log('[INFO]', ...args)
  },

  /**
   * Warning logging - always outputs.
   * Use for non-critical issues that should be monitored.
   */
  warn: (...args: unknown[]): void => {
    console.warn('[WARN]', ...args)
  },

  /**
   * Error logging - always outputs.
   * Use for errors and exceptions.
   */
  error: (...args: unknown[]): void => {
    console.error('[ERROR]', ...args)
  },
}

export default logger
