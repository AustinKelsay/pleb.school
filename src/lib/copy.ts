import copyConfig from '../../config/copy.json'

type CopyConfig = typeof copyConfig

// Utility type to get nested keys with dot notation
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`
}[keyof ObjectType & (string | number)]

type CopyKey = NestedKeyOf<CopyConfig>

/**
 * Get copy text by key path with type safety
 * @param key - Dot-notation path to the copy text (e.g., 'homepage.hero.title.line1')
 * @param replacements - Object with replacement values for template strings
 * @returns The copy text with optional template replacements
 */
export function getCopy<T extends CopyKey>(
  key: T,
  replacements?: Record<string, string | number>
): string {
  const keys = key.split('.')
  let value: unknown = copyConfig
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k]
    } else {
      console.warn(`Copy key not found: ${key}`)
      return key // Return the key as fallback
    }
  }
  
  if (typeof value !== 'string') {
    console.warn(`Copy value is not a string: ${key}`)
    return key
  }
  
  // Handle template replacements like {count}, {total}, etc.
  if (replacements) {
    return value.replace(/\{(\w+)\}/g, (match, placeholder) => {
      if (placeholder in replacements) {
        return String(replacements[placeholder])
      }
      return match
    })
  }
  
  return value
}

/**
 * Get copy object by key path (useful for getting entire sections)
 * @param key - Dot-notation path to the copy object
 * @returns The copy object
 */
export function getCopyObject<T extends CopyKey>(key: T): unknown {
  const keys = key.split('.')
  let value: unknown = copyConfig
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k]
    } else {
      console.warn(`Copy key not found: ${key}`)
      return {}
    }
  }
  
  return value
}

/**
 * Type-safe copy hook for React components
 * Returns both the getCopy function and common copy sections
 */
export function useCopy() {
  return {
    getCopy,
    getCopyObject,
    // Pre-configured common sections for convenience
    site: copyConfig.site,
    navigation: copyConfig.navigation,
    homepage: copyConfig.homepage,
    about: copyConfig.about,
    contentLibrary: copyConfig.contentLibrary,
    course: copyConfig.course,
    resource: copyConfig.resource,
    pricing: copyConfig.pricing,
    loading: copyConfig.loading,
    errors: copyConfig.errors,
    emptyStates: copyConfig.emptyStates,
    notFound: copyConfig.notFound
  }
}

// Export the config for direct access when needed
export { copyConfig }
export default copyConfig
