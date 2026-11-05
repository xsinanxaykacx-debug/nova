# NOVA CHAT

Cross-platform messaging application for web, Android, and iOS.

## Requirements
- Node.js 20.11+ (pinned to 20.15.1 in .nvmrc)
- pnpm 9.15.9 (Corepack recommended)

## Setup

```bash
corepack enable
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

Set client-safe values in apps/web/.env.local:
- NEXT_PUBLIC_SUPABASE_URL: Supabase project URL.
- NEXT_PUBLIC_SUPABASE_ANON_KEY: Supabase anon/publishable client key.

Never put a Supabase service_role key or privileged secret in a client variable or repository.

## Development

```bash
pnpm dev
```

Web: http://localhost:3000. Expo starts the mobile skeleton.

Useful commands: pnpm --filter @nova/web dev, pnpm --filter @nova/web build, pnpm build, pnpm lint, pnpm typecheck.

## Structure
- apps/web: Next.js 14 App Router.
- apps/mobile: Expo / React Native shell.
- packages/types: shared ciphertext-first domain types.
- packages/shared: platform-neutral utilities.
- packages/ui: shared UI boundary.
- packages/crypto: client-side cryptography boundary.
- packages/messaging: messaging domain and transport boundary.

## MVP-01 scope
Monorepo tooling, responsive web shell, Supabase browser/server helpers using client-safe environment variables, auth listener context, and foundational types. Login/register controls are visual placeholders; authentication flows are not wired. Mobile is a starter shell. No Signal Protocol implementation, message transport, migrations, or production security claims are included.
