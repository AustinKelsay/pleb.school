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

// Image URLs for seed content
// Using placeholder images that work without external dependencies
export const PLACEHOLDER_IMAGES = {
  welcomeCourse: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&h=400&fit=crop', // Education
  zapsCourse: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=800&h=400&fit=crop', // Lightning
  quickStart: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&h=400&fit=crop', // Code
  bitcoinBasics: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=800&h=400&fit=crop', // Bitcoin
  contentCreation: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800&h=400&fit=crop', // Writing
  architecture: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=400&fit=crop', // Tech
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
