"use client";

const DATABASE_NAME = "nova-e2ee";
const DATABASE_VERSION = 1;
const KEY_STORE = "identities";
const KEY_PREFIX = "nova-e2ee-v1";
const CANONICAL_E2EE_KEY_ORIGIN = "https://nova-chat-goezcue.vercel.app";
const identityPromises = new Map<string, Promise<LocalIdentity>>();

export interface LocalIdentity {
  publicKey: string;
  privateKey: CryptoKey;
}

interface StoredIdentity {
  publicKey: string;
  privateKey: CryptoKey;
}

function requireWebCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error("Bu tarayıcı güvenli Web Crypto API desteği sunmuyor.");
  return globalThis.crypto.subtle;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function openKeyDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Bu tarayıcı IndexedDB desteği sunmuyor."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Yerel şifreleme anahtarı veritabanı 10 saniye içinde yanıt vermedi. Diğer NOVA sekmelerini kapatıp yeniden deneyin."));
    }, 10_000);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE)) request.result.createObjectStore(KEY_STORE);
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      finish(() => resolve(request.result));
    };
    request.onerror = () => finish(() => reject(request.error ?? new Error("Anahtar veritabanı açılamadı.")));
    request.onblocked = () => finish(() => reject(new Error("Anahtar veritabanı başka bir sekmede güncelleniyor. Diğer NOVA sekmelerini kapatıp yeniden deneyin.")));
  });
}

async function readStoredIdentity(userId: string): Promise<StoredIdentity | null> {
  const database = await openKeyDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(KEY_STORE, "readonly").objectStore(KEY_STORE).get(userId);
      request.onsuccess = () => resolve((request.result as StoredIdentity | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Yerel anahtar okunamadı."));
    });
  } finally {
    database.close();
  }
}

async function storeIdentityIfAbsent(userId: string, identity: StoredIdentity): Promise<StoredIdentity> {
  const database = await openKeyDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(KEY_STORE, "readwrite");
      const store = transaction.objectStore(KEY_STORE);
      let winningIdentity: StoredIdentity | null = null;
      const request = store.get(userId);
      request.onsuccess = () => {
        const existing = request.result as StoredIdentity | undefined;
        if (existing) {
          winningIdentity = existing;
          return;
        }
        winningIdentity = identity;
        store.add(identity, userId);
      };
      request.onerror = () => reject(request.error ?? new Error("Yerel anahtar okunamadı."));
      transaction.oncomplete = () => {
        if (winningIdentity) resolve(winningIdentity);
        else reject(new Error("Yerel anahtar kaydı tamamlanamadı."));
      };
      transaction.onerror = () => reject(transaction.error ?? new Error("Yerel anahtar kaydedilemedi."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Yerel anahtar kaydı iptal edildi."));
    });
  } finally {
    database.close();
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error("Açık anahtar biçimi geçersiz.");
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function createIdentity(): Promise<LocalIdentity> {
  const subtle = requireWebCrypto();
  const generated = (await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  )) as CryptoKeyPair;
  const publicBytes = new Uint8Array(await subtle.exportKey("raw", generated.publicKey));
  const privateBytes = new Uint8Array(await subtle.exportKey("pkcs8", generated.privateKey));
  try {
    const privateKey = await subtle.importKey(
      "pkcs8", toArrayBuffer(privateBytes), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"],
    );
    return { publicKey: bytesToHex(publicBytes), privateKey };
  } finally {
    privateBytes.fill(0);
    publicBytes.fill(0);
  }
}

/** Restores a browser-local ECDH identity without silently replacing a key already published by this account. */
export function getOrCreateIdentity(userId: string, expectedPublicKey?: string | null): Promise<LocalIdentity> {
  const expected = expectedPublicKey?.toLowerCase() ?? null;
  if (!expected && typeof window !== "undefined" && window.location.origin !== CANONICAL_E2EE_KEY_ORIGIN) {
    return Promise.reject(new Error(
      "Bu önizleme adresi üretim Supabase veritabanını kullanıyor. Güvenlik nedeniyle burada yeni E2EE anahtarı kaydedilmez; üretim NOVA adresini kullanın veya ayrı bir test veritabanı tanımlayın.",
    ));
  }
  const existing = identityPromises.get(userId);
  if (existing) {
    return existing.then((identity) => {
      if (expected && identity.publicKey.toLowerCase() !== expected) {
        throw new Error("Bu tarayıcıdaki özel anahtar sunucudaki hesap anahtarıyla eşleşmiyor. Eski mesajları korumak için anahtar değiştirilmedi.");
      }
      return identity;
    });
  }
  const pending = (async () => {
    const stored = await readStoredIdentity(userId);
    if (stored !== null) {
      if (!stored.publicKey || !stored.privateKey || stored.privateKey.extractable !== false) {
        throw new Error("Bu tarayıcıdaki kayıtlı şifreleme anahtarı eksik veya geçersiz. Eski mesajları korumak için yeni anahtar oluşturulmadı.");
      }
      if (expected && stored.publicKey.toLowerCase() !== expected) {
        throw new Error("Bu tarayıcıdaki özel anahtar sunucudaki hesap anahtarıyla eşleşmiyor. Eski mesajları korumak için anahtar değiştirilmedi.");
      }
      return stored;
    }
    if (expected) {
      throw new Error("Bu hesap için sunucuda bir şifreleme anahtarı kayıtlı ancak bu tarayıcıda özel anahtar bulunamadı. Eski mesajları korumak için yeni anahtar oluşturulmadı.");
    }
    const identity = await createIdentity();
    return await storeIdentityIfAbsent(userId, identity);
  })();
  identityPromises.set(userId, pending);
  pending.catch(() => identityPromises.delete(userId));
  return pending;
}

/** Derives the same conversation AES key on both devices using ECDH + HKDF-SHA-256. */
export async function deriveConversationKey(
  privateKey: CryptoKey,
  peerPublicKeyHex: string,
  conversationId: string,
): Promise<CryptoKey> {
  const subtle = requireWebCrypto();
  const peerPublicKey = await subtle.importKey(
    "raw", toArrayBuffer(hexToBytes(peerPublicKeyHex)), { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const sharedBits = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: peerPublicKey }, privateKey, 256));
  try {
    const hkdfMaterial = await subtle.importKey("raw", toArrayBuffer(sharedBits), "HKDF", false, ["deriveKey"]);
    return await subtle.deriveKey(
      {
        name: "HKDF", hash: "SHA-256",
        salt: new TextEncoder().encode(conversationId),
        info: new TextEncoder().encode(KEY_PREFIX),
      },
      hkdfMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    sharedBits.fill(0);
  }
}

/** AES-256-GCM envelope: NOVA1:<12-byte-IV-hex>:<ciphertext+tag-hex>. */
export async function encrypt(plaintext: string, key: CryptoKey, conversationId: string): Promise<string> {
  const subtle = requireWebCrypto();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(`${KEY_PREFIX}:${conversationId}`);
  const encrypted = await subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData, tagLength: 128 },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `NOVA1:${bytesToHex(iv)}:${bytesToHex(new Uint8Array(encrypted))}`;
}

/** Decrypts and authenticates a NOVA1 AES-GCM envelope. */
export async function decrypt(envelope: string, key: CryptoKey, conversationId: string): Promise<string> {
  const parts = envelope.split(":");
  if (parts.length !== 3 || parts[0] !== "NOVA1") throw new Error("Bu mesaj yeni E2EE biçiminde değil veya bozuk.");
  const iv = hexToBytes(parts[1]);
  const ciphertext = hexToBytes(parts[2]);
  if (iv.length !== 12 || ciphertext.length < 16) throw new Error("Şifreli mesaj zarfı geçersiz.");
  const additionalData = new TextEncoder().encode(`${KEY_PREFIX}:${conversationId}`);
  const plaintext = await requireWebCrypto().decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData, tagLength: 128 },
    key,
    toArrayBuffer(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}


export interface GeneratedGroupKey {
  key: CryptoKey;
  rawKeyHex: string;
}

/** Creates a random AES-256 group key. Raw bytes are returned only for per-member wrapping. */
export async function createGroupKey(): Promise<GeneratedGroupKey> {
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(32));
  try {
    const key = await requireWebCrypto().importKey(
      "raw", toArrayBuffer(raw), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
    );
    return { key, rawKeyHex: bytesToHex(raw) };
  } finally {
    raw.fill(0);
  }
}

/** Derives a distinct wrapping context for each group-key epoch. Epoch 1 keeps the legacy context for existing groups. */
function groupKeyEpochContext(conversationId: string, keyVersion: number): string {
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new Error("Grup anahtar sürümü geçersiz.");
  return keyVersion === 1 ? conversationId : conversationId + ":group-key-epoch:" + keyVersion;
}

/** Wraps a group key for one member using the creator/member ECDH shared secret. */
export async function wrapGroupKey(
  rawKeyHex: string,
  senderPrivateKey: CryptoKey,
  recipientPublicKeyHex: string,
  conversationId: string,
  keyVersion = 1,
): Promise<string> {
  if (hexToBytes(rawKeyHex).length !== 32) throw new Error("Grup anahtarı geçersiz.");
  const wrappingKey = await deriveConversationKey(senderPrivateKey, recipientPublicKeyHex, groupKeyEpochContext(conversationId, keyVersion));
  return encrypt(rawKeyHex, wrappingKey, conversationId);
}

/** Unwraps the member-specific group-key envelope and imports a non-extractable AES key. */
export async function unwrapGroupKey(
  envelope: string,
  recipientPrivateKey: CryptoKey,
  senderPublicKeyHex: string,
  conversationId: string,
  keyVersion = 1,
): Promise<CryptoKey> {
  const wrappingKey = await deriveConversationKey(recipientPrivateKey, senderPublicKeyHex, groupKeyEpochContext(conversationId, keyVersion));
  const rawKeyHex = await decrypt(envelope, wrappingKey, conversationId);
  const raw = hexToBytes(rawKeyHex);
  if (raw.length !== 32) throw new Error("Çözülen grup anahtarının uzunluğu geçersiz.");
  try {
    return await requireWebCrypto().importKey(
      "raw", toArrayBuffer(raw), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
    );
  } finally {
    raw.fill(0);
  }
}
