# NOVA CHAT

Web-first encrypted messaging application. The Expo mobile app is currently a starter shell.

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

## MVP-05 end-to-end encryption
- `packages/crypto` implements ECDH P-256 identity keys, HKDF-SHA-256 conversation-key derivation, and AES-256-GCM authenticated message encryption with the browser Web Crypto API.
- On the first authenticated browser session, an identity is generated. The public key is published as a 130-character hex P-256 point in `profiles.public_key`; the private key is re-imported as non-extractable and persisted as a `CryptoKey` in IndexedDB (`nova-e2ee`).
- Private keys and plaintext are never sent to Supabase. `messages.ciphertext` stores a versioned `NOVA1:<iv-hex>:<ciphertext-hex>` envelope containing a random 96-bit IV and the AES-GCM authentication tag.
- Both participants independently derive the same AES key from ECDH shared bits and HKDF-SHA-256, salted with the conversation ID. The conversation ID is also authenticated as AES-GCM additional data.
- Existing MVP-04 Base64 messages are not treated as encrypted; they display as unsupported legacy ciphertext.
- Keys are browser-local. Clearing site data, switching browsers/devices, or losing IndexedDB makes prior messages unreadable; secure device transfer and recovery are future work.
- Public keys are currently distributed through Supabase profiles. Fingerprint/safety-number verification is not implemented yet, so this protects message content from database-only disclosure but does not yet protect against a malicious server substituting public keys or a compromised browser/XSS.
- Migration `20261105202525_add_profile_public_keys.sql` adds `profiles.public_key` and has been applied to the NOVA Supabase project.

## MVP-04 realtime messaging
- The server page loads the latest 100 messages through the member-only RLS policy.
- The client subscribes to `postgres_changes` INSERT events on `public.messages`, filtered by the active `conversation_id`.
- After `SUBSCRIBED`, the client refreshes history to close the hydration/subscription race window. Events and history are merged by message ID and sorted by timestamp.
- Sending encrypts the draft in the browser with the conversation AES-GCM key and inserts `conversation_id`, `sender_id`, `ciphertext`, and `sender_device_id`. The current user's UUID remains a temporary device-ID placeholder pending device registration.
- The client removes the channel on unmount. Successful inserts appear immediately; the Realtime echo is de-duplicated.
- Realtime payloads contain only the ciphertext envelope; plaintext is decrypted locally after receipt.

## Database migrations
Apply the migrations in `supabase/migrations/` to the NOVA Supabase project in filename order.

- MVP-02 creates `public.profiles`, an auth-user trigger, username constraints/indexes, and profile RLS. Public profile reads support discovery; updates are restricted to the matching `auth.uid()`. Trigger-only functions are not callable through the Data API.
- MVP-03 creates `public.conversations`, `public.conversation_members`, and `public.messages`. All three tables have RLS enabled. Conversation metadata, membership rows, and messages are readable only by current conversation members. Message inserts additionally require `sender_id = auth.uid()`.
- Private message storage is ciphertext-only: `messages` contains `ciphertext` and `sender_device_id`; it has **no plaintext `content` column**.
- MVP-04 adds `public.messages` to the `supabase_realtime` publication. Realtime delivery remains subject to the table's SELECT RLS policy.
- MVP-05 adds `profiles.public_key`; authenticated users may publish their own public key. Private keys remain in browser IndexedDB and are never stored in the database.
- Membership writes and conversation creation are not granted directly to clients. The authenticated `create_direct_conversation(target_user_id)` RPC creates both memberships atomically and reuses an existing direct conversation. Its membership-check helper lives in the non-exposed `private` schema.

## MVP-07 voice and file messages
- Voice notes are recorded with the browser `MediaRecorder`; files are selected from the device.
- Media metadata and bytes are serialized into one payload and encrypted with the active conversation key before insertion.
- Only `NOVA1:` ciphertext envelopes are accepted for media messages.
- Audio and file messages are limited to 300 KB each in this MVP.

## MVP-08 group conversations
- Groups support a name, optional avatar URL, multiple members, and admin/member roles.
- A random AES-256 group key is wrapped separately for each member using ECDH/HKDF and stored only as encrypted per-member envelopes in `conversation_keys`.
- Group messages use the group key; direct chats retain pairwise ECDH key derivation.
- Users can leave groups. Direct chats can be hidden from the current user's list. Senders can soft-delete their own messages.

## Per-user conversation controls
- Chat list supports pinning, favorites, archiving, and marking a conversation unread.
- These controls are stored on the current user's `conversation_members` row; they do not change another participant's list.

## Current limitations
- Private E2EE keys are browser-local. Clearing site data or switching browsers/devices without a transfer flow makes old messages unreadable.
- Public-key fingerprint verification and secure multi-device key transfer are not implemented.
- The Calls page is currently a UI shell; actual WebRTC voice/video calling and persistent call history are not implemented.
- The mobile app remains an Expo starter shell; the functional chat experience is currently in `apps/web`.

## Workspace
- apps/web: Next.js 14 App Router.
- apps/mobile: Expo / React Native shell.
- packages/types, shared, ui, crypto, messaging: shared workspace packages.
