# Configuration Documentation

Deep-dive reference documentation for each configuration file in `/config/`.

## Overview

Each document provides:
- Complete schema breakdown
- Field descriptions and types
- TypeScript accessor usage
- Configuration recipes
- Integration points

## Documents

| Document | Config File | Purpose |
|----------|-------------|---------|
| [auth-config.md](./auth-config.md) | `auth.json` | Authentication providers, session, UI |
| [content-config.md](./content-config.md) | `content.json` | Homepage sections, filters, search |
| [copy-config.md](./copy-config.md) | `copy.json` | User-facing text, navigation icons |
| [payments-config.md](./payments-config.md) | `payments.json` | Zap presets, purchase UX |
| [nostr-config.md](./nostr-config.md) | `nostr.json` | Relay sets, protocol settings |
| [admin-config.md](./admin-config.md) | `admin.json` | Admin pubkeys, permissions |

## Quick Links

- [Config System Overview](../config-system.md) - Master reference
- [Theme Configuration](../theme-configuration.md) - Theme system architecture
- [Icon System](../../implementation/icon-system.md) - Icon resolution

## When to Use

Use these docs when you need to:
- Understand what each config field does
- Find the correct TypeScript accessor
- See configuration examples/recipes
- Debug config-related issues

For quick lookups, start with [config-system.md](../config-system.md).
