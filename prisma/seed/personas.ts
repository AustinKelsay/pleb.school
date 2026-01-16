/**
 * Seed User Personas
 *
 * Defines the demo user personas and their deterministic key generation.
 * Keys are derived from SHA-256 hash of a seed string to ensure:
 * - Same personas produce same keys across runs
 * - Keys can be regenerated without storing them
 * - Predictable state for testing and development
 */

import { createHash } from 'crypto'
import { getPublicKey } from 'snstr'
import { SEED_PREFIX, generateAvatar, generateBanner } from './config'

export interface SeedPersona {
  id: string
  username: string | null
  displayName: string
  about: string | null
  email: string | null
  nip05: string | null
  lud16: string | null
  avatar: string | null
  banner: string | null
  role: 'admin' | 'creator' | 'learner' | null
  profileSource: 'nostr' | 'oauth'
  primaryProvider: string
}

export interface SeedPersonaWithKeys extends SeedPersona {
  privkey: string
  pubkey: string
}

/**
 * Generate a deterministic keypair from a persona ID.
 * Uses SHA-256 to create a 256-bit private key from the seed string.
 */
export function generateDeterministicKeypair(personaId: string): {
  privkey: string
  pubkey: string
} {
  const seed = `${SEED_PREFIX}:${personaId}`
  const privkey = createHash('sha256').update(seed).digest('hex')
  const pubkey = getPublicKey(privkey)
  return { privkey, pubkey }
}

/**
 * Demo persona definitions.
 * Each persona represents a different user type in the platform.
 */
export const PERSONAS: SeedPersona[] = [
  {
    id: 'satoshi-sensei',
    username: 'satoshi_sensei',
    displayName: 'Satoshi Sensei',
    about:
      'Educator and guide on your journey through decentralized learning. Building the future of permissionless education, one lesson at a time. [pleb.school demo]',
    email: 'sensei@demo.pleb.school',
    nip05: 'satoshisensei@vlt.ge',
    lud16: 'satoshisensei@vlt.ge',
    avatar: generateAvatar('satoshi-sensei'),
    banner: generateBanner('satoshi-sensei'),
    role: 'admin',
    profileSource: 'nostr',
    primaryProvider: 'nostr',
  },
  {
    id: 'lightning-lucy',
    username: 'lightning_lucy',
    displayName: 'Lightning Lucy',
    about:
      'Lightning enthusiast & payment wizard. I make zaps simple! Teaching the world to pay with sats. [pleb.school demo]',
    email: 'lucy@demo.pleb.school',
    nip05: 'lightninglucy@vlt.ge',
    lud16: 'lightninglucy@vlt.ge',
    avatar: generateAvatar('lightning-lucy'),
    banner: generateBanner('lightning-lucy'),
    role: 'creator',
    profileSource: 'nostr',
    primaryProvider: 'nostr',
  },
  {
    id: 'builder-bob',
    username: 'builder_bob',
    displayName: 'Builder Bob',
    about:
      'Developer, builder, and technical educator. I explain how things work under the hood. Code is poetry. [pleb.school demo]',
    email: 'bob@demo.pleb.school',
    nip05: 'builderbob@vlt.ge',
    lud16: 'builderbob@vlt.ge',
    avatar: generateAvatar('builder-bob'),
    banner: generateBanner('builder-bob'),
    role: 'creator',
    profileSource: 'nostr',
    primaryProvider: 'nostr',
  },
  {
    id: 'nostr-newbie',
    username: 'nostr_newbie',
    displayName: 'Alex (New User)',
    about:
      'Just getting started with Nostr and Bitcoin. Learning something new every day! [pleb.school demo]',
    email: 'alex@demo.pleb.school',
    nip05: 'nostrnewbie@vlt.ge',
    lud16: 'nostrnewbie@vlt.ge',
    avatar: generateAvatar('nostr-newbie'),
    banner: generateBanner('nostr-newbie'),
    role: 'learner',
    profileSource: 'oauth',
    primaryProvider: 'email',
  },
  {
    id: 'anon-learner',
    username: null,
    displayName: 'Anonymous Pleb',
    about: null,
    email: null,
    nip05: null,
    lud16: null,
    avatar: null,
    banner: null,
    role: null,
    profileSource: 'oauth',
    primaryProvider: 'anonymous',
  },
]

/**
 * Get all personas with their deterministic keys.
 * This is used during seeding to create users and sign events.
 */
export function getPersonasWithKeys(): SeedPersonaWithKeys[] {
  return PERSONAS.map(persona => {
    const { privkey, pubkey } = generateDeterministicKeypair(persona.id)
    return {
      ...persona,
      privkey,
      pubkey,
    }
  })
}

/**
 * Get a specific persona by ID with keys.
 */
export function getPersonaWithKeys(personaId: string): SeedPersonaWithKeys | undefined {
  const persona = PERSONAS.find(p => p.id === personaId)
  if (!persona) return undefined

  const { privkey, pubkey } = generateDeterministicKeypair(persona.id)
  return {
    ...persona,
    privkey,
    pubkey,
  }
}

/**
 * Get personas by role.
 */
export function getPersonasByRole(role: SeedPersona['role']): SeedPersona[] {
  return PERSONAS.filter(p => p.role === role)
}

/**
 * Get admin personas (for setting up admin roles).
 */
export function getAdminPersonas(): SeedPersona[] {
  return PERSONAS.filter(p => p.role === 'admin')
}

/**
 * Get content creator personas (admins and creators).
 */
export function getCreatorPersonas(): SeedPersona[] {
  return PERSONAS.filter(p => p.role === 'admin' || p.role === 'creator')
}
