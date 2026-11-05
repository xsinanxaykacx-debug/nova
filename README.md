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

Set only these client-safe values in `apps/web/.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase `sb_publishable_` key)

Never use a Supabase secret/service-role key in the web or mobile client. Never commit `.env.local`.

## Development

```bash
pnpm dev
```

Web: http://localhost:3000. Expo starts the mobile skeleton.

## MVP-02 authentication
- `/signup`: email/password registration, display name and requested username metadata.
- `/login`: email/password sign-in.
- `/profile`: authenticated profile editing and sign-out.
- Middleware refreshes the Supabase cookie session and protects `/profile`.
- Email confirmation returns through `/auth/callback`.

## Database migration
Apply the migrations in `supabase/migrations/` to the NOVA Supabase project in filename order. The second migration revokes direct API execution of trigger-only functions.

It creates `public.profiles` with `id`, `username`, `display_name`, `avatar_url`, timestamps, a case-insensitive unique username index, and a format constraint. An `auth.users` insert trigger creates a profile automatically. RLS allows public profile reads (username discovery) and restricts profile updates to the matching `auth.uid()`. No client insert/delete policy is granted.

## Workspace
- apps/web: Next.js 14 App Router.
- apps/mobile: Expo / React Native shell.
- packages/types, shared, ui, crypto, messaging: shared workspace packages.

Private message payloads remain ciphertext-only by design; this MVP does not implement messaging or Signal Protocol.
