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
- Middleware refreshes the Supabase cookie session and protects `/profile`, `/search`, and `/chat/*`.
- Email confirmation returns through `/auth/callback`.

## MVP-03 chat foundation
- `/search`: authenticated search by profile username or display name.
- `Mesaj Gönder` calls the authenticated `create_direct_conversation` RPC and opens `/chat/[conversation_id]`.
- Repeated direct-chat requests for the same pair reuse the existing conversation.
- The chat page verifies access by querying the conversation through RLS.

## Database migrations
Apply the migrations in `supabase/migrations/` to the NOVA Supabase project in filename order.

- MVP-02 creates `public.profiles`, an auth-user trigger, username constraints/indexes, and profile RLS. Public profile reads support discovery; updates are restricted to the matching `auth.uid()`. Trigger-only functions are not callable through the Data API.
- MVP-03 creates `public.conversations`, `public.conversation_members`, and `public.messages`. All three tables have RLS enabled. Conversation metadata, membership rows, and messages are readable only by current conversation members. Message inserts additionally require `sender_id = auth.uid()`.
- Private message storage is ciphertext-only: `messages` contains `ciphertext` and `sender_device_id`; it has **no plaintext `content` column**.
- Membership writes and conversation creation are not granted directly to clients. The authenticated `create_direct_conversation(target_user_id)` RPC creates both memberships atomically and reuses an existing direct conversation. Its membership-check helper lives in the non-exposed `private` schema.

The MVP-03 schema prepares the persistence boundary for E2EE; it does not yet implement client-side encryption, device registration, or message sending.

## Workspace
- apps/web: Next.js 14 App Router.
- apps/mobile: Expo / React Native shell.
- packages/types, shared, ui, crypto, messaging: shared workspace packages.
