# NOVA CHAT — System Architecture

> Status: Initial architecture draft  
> Scope: Web, Android, iOS, private messaging, public channels  
> Security boundary: Private conversations use client-side end-to-end encryption (E2EE).

## 1. System overview

The clients encrypt private-message content before it leaves the device. Supabase provides identity, authorization, persistence, realtime delivery, and encrypted-file storage; it is not a trusted plaintext processor for private conversations.

```text
+----------------------+       +----------------------+
|      Web client      |       |     Mobile client    |
|     React + TS       |       |      Expo            |
+----------+-----------+       +-----------+----------+
           |                               |
           +---------------+---------------+
                           |
                           v
              +--------------------------+
              | Client security layer   |
              | - Device identity       |
              | - Session/key handling |
              | - E2EE encrypt/decrypt  |
              | - Attachment encryption |
              +------------+-------------+
                           |
                  TLS-protected network
                           |
                           v
              +--------------------------+
              |       Supabase           |
              |                          |
              | Auth + RLS                |
              | PostgreSQL                |
              | Realtime                  |
              | Storage                   |
              +--------------------------+
```

## 2. System layers

| Layer | Planned technology | Responsibility |
|---|---|---|
| Web client | React + TypeScript | Browser experience and web-specific integration |
| Mobile client | Expo | Android and iOS application |
| Backend platform | Supabase | Managed backend services and client-facing APIs |
| Database | PostgreSQL | Profiles, devices, conversations, ciphertext, membership, and public content metadata |
| Realtime | Supabase Realtime | Message/event delivery; private message payloads remain ciphertext |
| File storage | Supabase Storage | Encrypted private attachments and public-channel media according to their respective access rules |
| Authentication | Supabase Auth | Account identity and authenticated sessions |
| Authorization | PostgreSQL Row Level Security (RLS) | Enforce access boundaries for rows and storage objects |

## 3. Server visibility and the E2EE boundary

### What the server can see

The service must be designed with the assumption that Supabase and its operators can observe service-side data, including:

- Account and profile information intentionally stored by the application.
- Conversation identifiers and membership relationships.
- Message routing metadata, including sender, recipient/conversation, and server-visible timestamps.
- Ciphertext, encrypted attachment objects, object sizes, and operational delivery metadata.
- Public channel content, which is not covered by private-chat E2EE.

### What the server must not receive for private conversations

- Private-message plaintext.
- Plaintext private attachment contents.
- Private-chat session secrets or private identity keys.
- Decryption keys needed to recover private-chat content.

Encryption and decryption for private conversations take place on user devices. The server stores and relays ciphertext. This boundary does not hide all metadata and does not protect content on a device that is already compromised or unlocked.

## 4. Web and mobile code-sharing strategy

The repository is organized as a monorepo. The `apps/` directory contains platform applications; the `packages/` directory contains code that can be shared where platform behavior and security requirements permit.

Planned package responsibilities:

- `packages/types`: shared domain types and API contracts.
- `packages/shared`: platform-neutral business rules and utilities.
- `packages/messaging`: message composition, serialization, and transport-facing logic.
- `packages/crypto`: the client-side cryptographic integration boundary. Platform-specific secure storage and cryptographic adapters must remain explicit.
- `packages/ui`: reusable presentation components where web and native rendering can genuinely share implementation.

Web and mobile may share domain logic and contracts, but must not assume that browser storage, native secure storage, permissions, push notifications, or cryptographic primitives behave identically. Platform-specific adapters belong in the relevant app or an explicitly platform-scoped package. No package may move private keys or plaintext processing to the server.

## 5. Realtime and message flow

1. The sender's client prepares a private message and encrypts it locally.
2. The client submits ciphertext and required routing metadata over a TLS-protected connection.
3. Supabase applies authentication and authorization policies, persists the ciphertext, and distributes the event.
4. The recipient's client receives the ciphertext and decrypts it locally.
5. Public-channel posts follow a separate, non-E2EE content path and must have explicit publication and moderation rules.

Realtime delivery is a transport mechanism; it is not itself an encryption protocol or proof of message delivery/read state.

## 6. Future: voice and video infrastructure

LiveKit (SFU) is a possible future component for scalable voice/video rooms and calls. **LiveKit is not part of the MVP.** No LiveKit service, SDK, deployment, or call flow is included in the initial implementation scope.

## 7. Open implementation decisions

The following details are intentionally not selected by this architecture draft:

- Exact Signal Protocol implementation/library and its platform compatibility.
- Production hosting, regional placement, and operational monitoring choices.
- Push-notification provider and privacy-preserving notification payload format.
- Final retention, deletion, and abuse-report evidence policies.

These choices require explicit review before implementation; this document does not silently select a vendor or library.
