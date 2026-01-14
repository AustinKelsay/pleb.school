# Implementation Documentation

Implementation guides, upgrade plans, and setup instructions for pleb.school. These documents describe **how to implement features** and serve as historical references for past development work.

## Active Implementations

| Document | Description | Status |
|----------|-------------|--------|
| [icon-system.md](./icon-system.md) | Config-driven icon resolution and usage patterns | Active |
| [purchases-zaps.md](./purchases-zaps.md) | Purchase system implementation details | Active |

## Completed Plans

| Document | Description | Status |
|----------|-------------|--------|
| [purchases-plan.md](./purchases-plan.md) | NIP-57 purchase implementation (API reference) | Implemented |
| [auth-upgrade-plan.md](./auth-upgrade-plan.md) | NIP-98 auth and account linking upgrade | Implemented |
| [account-linking-implementation.md](./account-linking-implementation.md) | Multi-provider account linking flows | Implemented |
| [profile-implementation-reference.md](./profile-implementation-reference.md) | Profile system implementation guide | Implemented |

## Setup Guides

| Document | Description |
|----------|-------------|
| [github-oauth-setup.md](./github-oauth-setup.md) | GitHub OAuth app configuration |

## Gap Analysis

| Document | Description |
|----------|-------------|
| [purchase-gaps.md](./purchase-gaps.md) | Known edge cases and uncovered scenarios |

---

## Document Conventions

- **Naming**: All files use `kebab-case.md`
- **Status Tags**: `Active`, `Implemented`, `Deprecated`, `Planned`
- **Historical Context**: Plans include "Last Updated" and author info
- **Implementation Status**: Clear indicators of what's shipped vs planned

## When to Use Context vs Implementation

- **Context docs**: Reference material explaining how systems work
- **Implementation docs**: Historical plans, upgrade guides, and implementation details
