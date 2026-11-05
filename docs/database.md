# NOVA CHAT — Database Design

> Status: Initial logical schema and RLS intent  
> Database: PostgreSQL (Supabase)  
> Important: This document describes intent, not executable SQL or a finalized schema.

## 1. Table inventory

| Table | Responsibility |
|---|---|
| `profiles` | Stores user-facing profile fields such as display name, username, avatar reference, and profile preferences. It must not contain authentication secrets or private cryptographic keys. |
| `devices` | Registers each user's individual web or mobile device, its lifecycle state, and non-secret device metadata needed for session and device management. |
| `identity_keys` | Stores public device identity-key material and related public-key metadata. Private identity keys remain on the device and are never stored here. |
| `prekeys` | Stores public prekey material and its availability/consumption state for asynchronous session establishment. Private prekey material remains on the device. |
| `conversations` | Represents a private conversation and its high-level state, such as creation time and conversation type. |
| `conversation_members` | Associates users/devices as appropriate with conversations and records membership state and role metadata. The final user-versus-device membership model remains to be specified. |
| `messages` | Stores message routing metadata, timestamps, delivery-related state, and encrypted message payloads. **Plaintext message content must NEVER be written; private message bodies are ciphertext only.** |
| `attachments` | Stores references and metadata for uploaded files, including encrypted-object references for private conversations. Private attachment bytes must be encrypted client-side before upload. |
| `groups` | Stores group-specific information such as title, description, and group settings, linked to the relevant conversation/membership model. |
| `channels` | Stores public or discoverable channel information, ownership, visibility, and publication settings. Channel content is standard server-managed content, not private-chat E2EE. |
| `channel_posts` | Stores posts and publication metadata belonging to channels. Content is server-visible according to channel visibility and moderation requirements. |
| `blocks` | Records which user has blocked which other user and supports enforcement of blocking behavior. |
| `reports` | Stores user-submitted reports and moderation workflow metadata. Access to report details must be restricted to the reporter and authorized moderation personnel. |

## 2. Critical message-content rule

**The `messages` table must never store plaintext private-message content.** Private message payloads are stored as ciphertext, with only the metadata required for routing, ordering, delivery, and retention.

The same rule applies to private attachments: the object uploaded to Storage must already be encrypted by the sender's client. Filenames, thumbnails, previews, captions, and notification text can also reveal content and must not be assumed safe merely because the main message body is encrypted.

Public channel posts are intentionally outside this private-chat E2EE boundary and may be stored as server-readable content.

## 3. Row Level Security (RLS) intent

These statements describe intended access, not final policy expressions. Every table exposed through client-facing APIs must have RLS enabled and tested. Service-role bypass must remain server-side and tightly controlled.

| Table | Intended visibility and access |
|---|---|
| `profiles` | Authenticated users may read the profile fields designated as discoverable; a user may create and update only their own profile. Private account fields must not be exposed through this table. |
| `devices` | A user may read and manage only their own registered devices; other users cannot enumerate device records. |
| `identity_keys` | Authenticated users may read public identity-key material needed to initiate conversations; only the owning device may register or rotate its public identity record. Private key material is never accessible because it is never stored. |
| `prekeys` | Authenticated clients may obtain eligible public prekeys for session setup; publication and one-time-prekey claiming/consumption must be controlled atomically so a prekey cannot be claimed twice. |
| `conversations` | Only current conversation members may read conversation metadata; creation and updates are limited to authorized participants and permitted conversation operations. |
| `conversation_members` | Members may see membership information for conversations they belong to; membership changes are limited to authorized owners/admins and explicit join/leave flows. |
| `messages` | Only authorized members of the associated conversation may read ciphertext and routing metadata or submit messages; users cannot read messages from conversations they do not belong to. |
| `attachments` | Only authorized conversation members may access private attachment metadata and encrypted objects; public-channel attachment access follows the channel's visibility and publication policy. |
| `groups` | Only group members may read private group details; group creation and settings changes are restricted to authorized group owners/admins. |
| `channels` | Public channels may be discoverable/readable according to their visibility setting; only channel owners and authorized administrators may change channel configuration. |
| `channel_posts` | Published posts in public channels may be read according to channel visibility; only authorized channel publishers may create, edit, or remove posts. |
| `blocks` | A user may read and manage only block relationships they created; other users cannot enumerate a user's block list. |
| `reports` | A reporter may submit and view their own reports; only explicitly authorized moderators may access reports for moderation. Moderator identity and role assignment must be defined before production policies are finalized. |

## 4. Suggested migration order

The order below follows logical foreign-key dependencies. Exact constraints and join keys must be confirmed when the schema is implemented.

1. **profiles** — establishes the application user/profile record associated with authenticated users.
2. **devices** — depends on the user/profile identity.
3. **identity_keys** — depends on devices.
4. **prekeys** — depends on devices and public identity-key lifecycle.
5. **conversations** — independent conversation root.
6. **conversation_members** — depends on conversations and profiles (and, if selected, devices).
7. **messages** — depends on conversations and sender/member identity.
8. **attachments** — depends on messages and/or conversations, according to the final attachment ownership model.
9. **groups** — depends on conversations and group ownership/membership.
10. **channels** — depends on profiles for channel ownership.
11. **channel_posts** — depends on channels and author identity.
12. **blocks** — depends on the two user/profile identities involved.
13. **reports** — depends on reporter identity and the report target model.

RLS policies, grants, indexes, and storage-object policies should be added in migrations after the relevant tables and relationships exist. Policies must be tested with authenticated users, anonymous users where applicable, and privileged server contexts.

## 5. Index recommendations

Final index definitions depend on column names, cardinality, and query plans. Candidate indexes include:

- `profiles(username)` — unique, case-normalized lookup if usernames are required to be unique.
- `devices(user_id, status)` — list a user's active/revoked devices.
- `identity_keys(device_id)` — retrieve public identity material by device.
- `prekeys(device_id, status)` — find available prekeys and support controlled consumption.
- `conversation_members(user_id, conversation_id)` — list a user's conversations.
- `conversation_members(conversation_id, user_id)` — list and validate conversation membership.
- `messages(conversation_id, created_at)` — retrieve messages in conversation order.
- `messages(conversation_id, id)` — support stable cursor pagination if the chosen identifier and query pattern require it.
- `attachments(message_id)` and/or `attachments(conversation_id)` — retrieve attachment metadata for a message or conversation.
- `groups(conversation_id)` — resolve group details from the associated conversation.
- `channels(owner_id, visibility)` — list channels by owner and visibility.
- `channel_posts(channel_id, created_at)` — retrieve channel posts in publication order.
- `blocks(blocker_id, blocked_id)` — check whether a user has blocked another user; enforce uniqueness for the pair.
- `reports(status, created_at)` — support moderation queues, subject to the final moderation access model.

Index selection must be validated against actual query plans. Avoid indexing sensitive plaintext because private plaintext must not exist in these tables.

## 6. Decisions required before schema implementation

The following are deliberately left open rather than silently assumed:

- Whether conversation membership is user-based, device-based, or represented through both levels.
- Whether group conversations use the same membership and message tables, and the exact group-to-conversation relationship.
- Whether attachments are owned by messages, conversations, or both.
- Which profile fields are discoverable to authenticated users and which are private.
- The exact moderator role source and authorization boundary for `reports`.
- Whether public channels support anonymous reads or require an authenticated account.
- Message deletion, retention, edit history, and report-evidence behavior.
