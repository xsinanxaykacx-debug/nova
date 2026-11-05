# NOVA CHAT — Security Model

> Status: Initial security design  
> Private conversations: End-to-end encrypted (E2EE)  
> Public channels: Standard server-managed content; not E2EE

## 1. Threat model

This document identifies the initial threats and the intended protection boundary. It is not a completed security audit or a claim of formal verification.

### Server operator or backend compromise

**Threat:** A Supabase operator, privileged backend operator, database reader, storage reader, or attacker who obtains server-side data attempts to read private conversations.

**Intended protection:** Private-message bodies and private attachments are encrypted on the client before upload. The server stores and relays ciphertext and does not hold the private keys required to decrypt it. Access controls and RLS reduce unauthorized access to account and routing data, but RLS is not a substitute for E2EE.

**Residual exposure:** The service can observe metadata such as sender, recipient/conversation, timestamps, membership, ciphertext size, and operational events. Public-channel content is not protected by private-chat E2EE.

### Network listener or active network attacker

**Threat:** An attacker observes or modifies traffic between a client and the service.

**Intended protection:** TLS protects transport connections. E2EE additionally protects private-message content if transport security terminates at an intermediary or the service. Clients must validate the service endpoint and reject invalid transport certificates through their platform networking stack.

**Residual exposure:** Traffic patterns, timing, endpoint information, and other metadata may remain observable. TLS and E2EE do not conceal all network activity.

### Stolen, lost, or compromised device

**Threat:** An attacker gains access to a device, its unlocked session, local application data, or active cryptographic material.

**Intended protection:** Device-local key storage should use platform security facilities where available. Applications should minimize plaintext lifetime and avoid logging plaintext or secrets.

**Residual exposure:** E2EE cannot protect plaintext displayed on a compromised or unlocked endpoint. Device revocation, secure local storage, session expiration, and recovery behavior require implementation and testing.

## 2. Encryption scope

| Content type | Protection model |
|---|---|
| Private one-to-one conversations | E2EE; encryption/decryption occurs on endpoints |
| Private group conversations | Intended E2EE scope; group key distribution and membership-change behavior require a separately reviewed design |
| Public channels | Standard server-managed content; not E2EE |
| Public profile and discovery information | Visible according to product and privacy settings; not private-chat E2EE |

A public channel must not be represented to users as an E2EE private conversation. Moderation, search, previews, and publication workflows for channels must be designed with their server-visible content model in mind.

## 3. Protocol description (no implementation specified here)

The intended private-messaging protocol family is the **Signal Protocol**, with the following conceptual components:

- **X3DH (Extended Triple Diffie-Hellman):** establishes an initial shared secret between participants using identity and prekey material, including asynchronous session initiation.
- **Double Ratchet:** derives evolving message keys and updates session state as messages are exchanged, providing forward-secrecy and recovery properties under the protocol's assumptions.

This section is descriptive only. It does not select a specific library, version, binding, or implementation. Protocol integration must use a maintained, reviewed implementation and must not be replaced with custom cryptography.

## 4. Device identity and prekey management

- Each registered device has its own cryptographic identity key pair.
- Public identity and prekey material may be published to the service; private key material remains on the originating device.
- Prekeys are published for asynchronous session establishment.
- A one-time prekey must be claimed/consumed atomically so it cannot be allocated to multiple session initiations. The service may track public prekey availability and consumption state, but must never receive the corresponding private key.
- Signed-prekey rotation, replenishment thresholds, expiration, device revocation, and recovery behavior require explicit implementation rules and security review.
- Device identity is not equivalent to account identity: a user's devices must be represented and authorized individually.

## 5. Metadata boundary

**The server can see message time, sender, and recipient/conversation routing information.** It can also see account identifiers, membership, delivery events, ciphertext, and potentially ciphertext/object sizes and access patterns.

E2EE protects private message content; it does not automatically hide metadata. The initial design does not claim traffic-analysis resistance, anonymous communication, or hidden social graphs.

## 6. Explicitly out of scope for MVP-01

The following features are deferred to **MVP-02** and must not be implied as available in MVP-01:

- Multi-device key distribution and synchronized encrypted sessions.
- Encrypted backup and account/device recovery of private cryptographic material.
- In-app safety-number or QR-based identity-verification UI.

MVP-01 must clearly communicate its device and recovery limitations. Adding a second device must not silently copy private keys or bypass the deferred key-distribution design.

## 7. Secret management and privileged credentials

- The Supabase `service_role` key must never be shipped to web or mobile clients.
- The `service_role` key must never be exposed to or accessed by an AI agent/automation agent.
- Privileged credentials belong only in a controlled server-side secret manager/runtime with least-privilege access and audited operational procedures.
- Client applications may use only appropriately scoped public client configuration and must rely on Auth and RLS for user-level authorization.
- Do not commit API keys, access tokens, private keys, connection strings, or `.env` files to the repository.
- Logs, analytics, crash reports, and support tooling must not capture plaintext private messages, private keys, session secrets, or authentication tokens.

## 8. Security review gates

Before production use, review at minimum: protocol/library suitability for web and native platforms, secure local key storage, atomic prekey consumption, account/device lifecycle, group membership changes, attachment encryption, notification previews, logging, RLS policies, rate limiting, and recovery/revocation behavior.
