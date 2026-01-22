/**
 * Seed Configuration
 *
 * Constants and configuration for the demo seed data.
 * The seed version is included in key generation to allow
 * regenerating new identities if needed in the future.
 */

export const SEED_VERSION = 'v1'
export const SEED_PREFIX = `pleb.school-demo-seed-${SEED_VERSION}`

// Relays for publishing seed content
// Using the same relays configured in config/nostr.json
export const PUBLISH_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nostr.land',
]

// Timeout for relay operations (ms)
export const RELAY_TIMEOUT = 10000

// Placeholder YouTube videos for video content
// These are educational Bitcoin/Lightning/Nostr videos
export const PLACEHOLDER_VIDEOS = {
  bitcoinBasics: 'https://www.youtube.com/watch?v=bBC-nXj3Ng4', // "What is Bitcoin?" by 99Bitcoins
  lightningNetwork: 'https://www.youtube.com/watch?v=rrr_zPmEiME', // "Lightning Network Explained"
  nostrIntro: 'https://www.youtube.com/watch?v=5W-jtbbh4gA', // "What is Nostr?"
  walletSetup: 'https://www.youtube.com/watch?v=CwV6qJRAWlU', // Lightning wallet tutorial
} as const

// CDN base URL for seed content images
const SEED_IMAGE_CDN = 'https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/images/pleb-school/seed-data'

// Image URLs for seed content
export const PLACEHOLDER_IMAGES = {
  // Course images
  welcomeCourse: `${SEED_IMAGE_CDN}/platform-overview.png`,
  zapsCourse: `${SEED_IMAGE_CDN}/payment-system-and-zaps.png`,
  // Standalone resource images
  quickStart: `${SEED_IMAGE_CDN}/quick-start-guide.png`,
  bitcoinBasics: `${SEED_IMAGE_CDN}/bitcoin-basics-for-admins-and-builders.png`,
  contentCreation: `${SEED_IMAGE_CDN}/creating-content-on-pleb-school.png`,
  architecture: `${SEED_IMAGE_CDN}/platform-architecture-deep-dive.png`,
  // Additional specific images
  platformOverview: `${SEED_IMAGE_CDN}/platform-overview.png`,
  hybridArchitecture: `${SEED_IMAGE_CDN}/hybrid-data-architecutre.png`,
  authSystem: `${SEED_IMAGE_CDN}/authentication-and-identity-system.png`,
  paymentSystem: `${SEED_IMAGE_CDN}/payment-system-and-zaps.png`,
  configuration: `${SEED_IMAGE_CDN}/configuration-and-customization.png`,
  publishingFlow: `${SEED_IMAGE_CDN}/content-publishing-flow.png`,
} as const

// Avatar generation using RoboHash
export function generateAvatar(personaId: string): string {
  return `https://robohash.org/${encodeURIComponent(personaId)}?set=set4&size=200x200`
}

// Banner generation using Unsplash
export function generateBanner(personaId: string): string {
  // Use different banner styles based on persona
  const bannerMap: Record<string, string> = {
    'satoshi-sensei': 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&h=400&fit=crop', // Bitcoin
    'lightning-lucy': 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=1200&h=400&fit=crop', // Lightning
    'builder-bob': 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&h=400&fit=crop', // Tech
    'nostr-newbie': 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&h=400&fit=crop', // Learning
    'anon-learner': 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&h=400&fit=crop', // Abstract
  }
  return bannerMap[personaId] || bannerMap['nostr-newbie']
}
