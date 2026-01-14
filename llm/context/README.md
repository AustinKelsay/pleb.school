# Context Documentation

Reference documentation for pleb.school's architecture, systems, and patterns. These documents describe **how things work** and serve as authoritative references for understanding the codebase.

## Core Architecture

| Document | Description |
|----------|-------------|
| [data-architecture.md](./data-architecture.md) | Database adapter pattern (CourseAdapter, ResourceAdapter, etc.) |
| [database-schema.md](./database-schema.md) | Complete Prisma schema with model relationships |
| [nostr-events.md](./nostr-events.md) | Nostr event structures (NIP-23, NIP-51, NIP-99) and parsing |
| [type-definitions.md](./type-definitions.md) | TypeScript interfaces and type transformations |

## Authentication & Identity

| Document | Description |
|----------|-------------|
| [authentication-system.md](./authentication-system.md) | Auth providers, NIP-98 verification, session handling |
| [profile-system-architecture.md](./profile-system-architecture.md) | Multi-account profile aggregation and priority rules |
| [profile-api-reference.md](./profile-api-reference.md) | Complete profile and account management API reference |

## Content & Publishing

| Document | Description |
|----------|-------------|
| [drafts-and-publishing.md](./drafts-and-publishing.md) | Draft creation through Nostr publishing workflow |
| [routing-patterns.md](./routing-patterns.md) | Content routing (courses vs resources) and URL structure |

## Payments & Purchases

| Document | Description |
|----------|-------------|
| [purchases-and-zaps.md](./purchases-and-zaps.md) | NIP-57 zap purchases, entitlement detection, gating |
| [zap-flow.md](./zap-flow.md) | Zap dialog component behavior and user flows |

## Configuration & Theming

| Document | Description |
|----------|-------------|
| [config-system.md](./config-system.md) | JSON configuration files overview (master reference) |
| [theme-configuration.md](./theme-configuration.md) | Theme and font configuration system |
| [config/](./config/) | Deep-dive documentation for each config file |

### Config Deep-Dive Documents

| Document | Config File | Description |
|----------|-------------|-------------|
| [auth-config.md](./config/auth-config.md) | `auth.json` | Authentication providers, session, UI |
| [content-config.md](./config/content-config.md) | `content.json` | Homepage sections, filters, search |
| [copy-config.md](./config/copy-config.md) | `copy.json` | User-facing text, navigation icons |
| [payments-config.md](./config/payments-config.md) | `payments.json` | Zap presets, purchase UX |
| [nostr-config.md](./config/nostr-config.md) | `nostr.json` | Relay sets, protocol settings |
| [admin-config.md](./config/admin-config.md) | `admin.json` | Admin pubkeys, permissions |

## Infrastructure

| Document | Description |
|----------|-------------|
| [api-patterns.md](./api-patterns.md) | API validation, error handling, response utilities |
| [caching-patterns.md](./caching-patterns.md) | In-memory caching with TTL and tag invalidation |
| [encryption-key-management.md](./encryption-key-management.md) | Private key encryption, rotation, and recovery procedures |
| [rate-limiting.md](./rate-limiting.md) | Rate limiting implementation |
| [security-patterns.md](./security-patterns.md) | Audit logging, input validation, key handling |
| [view-analytics.md](./view-analytics.md) | Hybrid KV + database view counter system |

## Frontend

| Document | Description |
|----------|-------------|
| [hooks-reference.md](./hooks-reference.md) | Complete React hooks documentation |
| [components-architecture.md](./components-architecture.md) | Component organization and patterns |
| [search-system.md](./search-system.md) | Full-text search implementation |

## External References

| Document | Description |
|----------|-------------|
| [snstr/](./snstr/) | Nostr protocol library documentation (NIP-01, NIP-07, NIP-19, NIP-57) |

---

## Document Conventions

- **Naming**: All files use `kebab-case.md`
- **Focus**: Each document covers a single system or concept
- **Code Examples**: Practical examples with file path references
- **Cross-References**: Links to related documents where helpful

## When to Use Context vs Implementation

- **Context docs**: Reference material explaining how systems work
- **Implementation docs**: Historical plans, upgrade guides, and implementation details
