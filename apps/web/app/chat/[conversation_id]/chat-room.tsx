"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCheck, LockKeyhole, Mic, Paperclip, Send, Smile, MoreVertical, Phone, Video } from "lucide-react";
import type { Message } from "@nova/types";
import { decrypt, deriveConversationKey, encrypt, getOrCreateIdentity } from "@nova/crypto";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ChatSidebar } from "@/components/chat-sidebar";

type ChatRoomProps = {
  conversationId: string;
  currentUserId: string;
  peerPublicKey: string | null;
  peerName: string;
  peerUsername: string;
  peerAvatarUrl: string | null;
  initialMessages: Message[];
};

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map<string, Message>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort((left, right) => {
    const difference = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    return difference || left.id.localeCompare(right.id);
  });
}

function initials(name: string) {
  return name.trim().split(/\\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "N";
}

export function ChatRoom({ conversationId, currentUserId, peerPublicKey, peerName, peerUsername, peerAvatarUrl, initialMessages }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "live" | "error">("connecting");
  const [cryptoReady, setCryptoReady] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const decryptedIds = useRef(new Set<string>());
  const decryptingIds = useRef(new Set<string>());
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);

  const addMessages = useCallback((next: Message[]) => {
    setMessages((current) => mergeMessages(current, next));
  }, []);

  useEffect(() => {
    let active = true;
    setCryptoReady(false);
    setSharedKey(null);

    async function initializeEncryption() {
      try {
        if (!peerPublicKey) throw new Error("Karşı tarafın açık anahtarı henüz hazır değil. Diğer kullanıcının giriş yapmasını bekle veya sohbeti yenile.");
        const identity = await getOrCreateIdentity(currentUserId);
        const { error: publishError } = await supabase.from("profiles").update({ public_key: identity.publicKey }).eq("id", currentUserId);
        if (publishError) throw new Error("Açık anahtar profiline kaydedilemedi: " + publishError.message);
        const key = await deriveConversationKey(identity.privateKey, peerPublicKey, conversationId);
        if (!active) return;
        decryptedIds.current.clear();
        setDecryptedMessages({});
        setSharedKey(key);
        setCryptoReady(true);
        setError("");
      } catch (initializationError) {
        if (!active) return;
        console.error("E2EE initialization failed:", initializationError);
        setError(initializationError instanceof Error ? initializationError.message : "Şifreleme başlatılamadı.");
      }
    }
    void initializeEncryption();
    return () => { active = false; };
  }, [conversationId, currentUserId, peerPublicKey, supabase]);

  useEffect(() => {
    if (!sharedKey) return;
    const activeKey = sharedKey;
    async function decryptPendingMessages() {
      const pending = messages.filter((message) => !decryptedIds.current.has(message.id) && !decryptingIds.current.has(message.id));
      for (const message of pending) {
        decryptingIds.current.add(message.id);
        try {
          const plaintext = await decrypt(message.ciphertext, activeKey, conversationId);
          setDecryptedMessages((current) => ({ ...current, [message.id]: plaintext }));
        } catch (decryptError) {
          console.warn("Unable to decrypt message:", message.id, decryptError);
          setDecryptedMessages((current) => ({ ...current, [message.id]: "Bu mesaj çözülemedi. Eski şifreleme biçiminde olabilir veya anahtar doğrulanamadı." }));
        } finally {
          decryptingIds.current.delete(message.id);
          decryptedIds.current.add(message.id);
        }
      }
    }
    void decryptPendingMessages();
  }, [conversationId, messages, sharedKey]);

  useEffect(() => {
    let active = true;
    const channel = supabase.channel(`conversation:${conversationId}`).on("postgres_changes", {
      event: "INSERT", schema: "public", table: "messages",
    }, (payload) => {
      if (!active) return;
      const incoming = payload.new as Message;
      if (incoming.conversation_id === conversationId) addMessages([incoming]);
    }).subscribe(async (status, subscriptionError) => {
      if (!active) return;
      if (status === "SUBSCRIBED") {
        setConnection("live");
        const { data, error: historyError } = await supabase.from("messages")
          .select("id, conversation_id, sender_id, ciphertext, sender_device_id, created_at")
          .eq("conversation_id", conversationId).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(100);
        if (!active) return;
        if (historyError) setError("Mesaj geçmişi yenilenemedi. Canlı bağlantı devam ediyor.");
        else addMessages((data ?? []) as Message[]);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.error("Realtime subscription status:", status, subscriptionError);
        setConnection("error");
      }
    });
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [addMessages, conversationId, supabase]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, decryptedMessages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    if (text.length > 4000) { setError("Mesaj en fazla 4000 karakter olabilir."); return; }
    if (!sharedKey || !cryptoReady) { setError("Uçtan uca şifreleme henüz hazır değil. Açık anahtar bağlantısını kontrol et."); return; }
    setSending(true);
    setError("");
    try {
      const ciphertext = await encrypt(text, sharedKey, conversationId);
      const { data, error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversationId, sender_id: currentUserId, ciphertext, sender_device_id: currentUserId,
      }).select("id, conversation_id, sender_id, ciphertext, sender_device_id, created_at").single();
      if (insertError || !data) throw new Error(insertError?.message ?? "Şifreli mesaj veritabanına kaydedilemedi.");
      addMessages([data as Message]);
      setDraft("");
      if (inputRef.current) inputRef.current.style.height = "auto";
    } catch (sendError) {
      console.error("E2EE message send failed:", sendError);
      setError(sendError instanceof Error ? sendError.message : "Şifreli mesaj gönderilemedi.");
    } finally { setSending(false); }
  }

  function insertEmoji() {
    setDraft((current) => current + "🙂");
    inputRef.current?.focus();
  }

  return (
    <main className="chat-app-shell flex h-[100dvh] min-h-[560px] overflow-hidden bg-[#07111f] text-slate-100">
      <ChatSidebar activeConversationId={conversationId} />
      <section className="chat-room-panel flex min-w-0 flex-1 flex-col">
        <header className="chat-room-header flex h-[76px] shrink-0 items-center justify-between border-b border-slate-800/80 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/chat" aria-label="Sohbet listesine dön" className="icon-button md:hidden"><ArrowLeft size={20} /></Link>
            <div className="avatar-ring avatar-ring-large">{peerAvatarUrl ? <Image src={peerAvatarUrl} alt="" width={46} height={46} unoptimized className="h-full w-full rounded-full object-cover" /> : <span>{initials(peerName)}</span>}</div>
            <div className="min-w-0"><h1 className="truncate text-sm font-semibold text-slate-100">{peerName}</h1><p className="mt-0.5 truncate text-xs text-slate-500">{peerUsername ? `@${peerUsername} · ` : ""}{connection === "live" ? "çevrimiçi" : connection === "error" ? "bağlantı sorunu" : "bağlanıyor..."}</p></div>
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            <span className={`mr-2 hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] sm:inline-flex ${cryptoReady ? "border-sky-500/20 bg-sky-500/10 text-sky-300" : "border-slate-700 text-slate-500"}`}><LockKeyhole size={12} />{cryptoReady ? "Uçtan uca şifreli" : "Şifreleme hazırlanıyor"}</span>
            <button type="button" aria-label="Sesli arama yakında" title="Sesli arama yakında" disabled className="icon-button opacity-40"><Phone size={18} /></button>
            <button type="button" aria-label="Görüntülü arama yakında" title="Görüntülü arama yakında" disabled className="icon-button opacity-40"><Video size={18} /></button>
            <button type="button" aria-label="Diğer seçenekler" className="icon-button"><MoreVertical size={19} /></button>
          </div>
        </header>

        <div className="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-8 sm:py-7" aria-live="polite" aria-label="Şifreli mesaj geçmişi">
          <div className="mx-auto mb-6 flex max-w-xl justify-center"><span className="security-pill"><LockKeyhole size={12} /> Mesajlar uçtan uca şifrelidir. Yalnızca bu sohbetteki kişiler okuyabilir.</span></div>
          {messages.length === 0 ? <div className="flex min-h-[45vh] items-center justify-center text-center"><div className="rounded-2xl border border-slate-700/60 bg-slate-950/60 px-7 py-6 backdrop-blur"><LockKeyhole size={25} className="mx-auto mb-3 text-sky-400" /><p className="font-medium text-slate-200">Güvenli sohbet hazır</p><p className="mt-2 text-sm text-slate-500">İlk şifreli mesajını gönder.</p></div></div> : (
            <div className="mx-auto flex max-w-4xl flex-col gap-2.5">
              {messages.map((message) => {
                const own = message.sender_id === currentUserId;
                const content = decryptedMessages[message.id];
                return <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                  <article className={`message-bubble ${own ? "message-bubble-outgoing" : "message-bubble-incoming"}`}>
                    <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.55]">{content ?? "Şifre çözülüyor..."}</p>
                    <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${own ? "text-sky-100/75" : "text-slate-500"}`}>
                      <time>{new Date(message.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time>
                      {own && <CheckCheck size={15} className="text-sky-200" aria-label="İletildi" />}
                    </div>
                  </article>
                </div>;
              })}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p role="status" className="mx-4 mb-2 rounded-xl border border-rose-900/60 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">{error}</p>}
        <form onSubmit={sendMessage} className="chat-composer flex shrink-0 items-end gap-2.5 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
          <button type="button" onClick={insertEmoji} aria-label="Emoji ekle" title="Emoji ekle" className="composer-icon-button mb-1"><Smile size={22} /></button>
          <button type="button" disabled aria-label="Dosya ekleme yakında" title="Dosya ekleme yakında" className="composer-icon-button mb-1 hidden sm:inline-flex"><Paperclip size={21} /></button>
          <label className="sr-only" htmlFor="chat-message">Mesajın</label>
          <textarea id="chat-message" ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
          }} onInput={(event) => { event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 120)}px`; }}
            rows={1} maxLength={4000} placeholder={cryptoReady ? "Bir mesaj yazın" : "Şifreleme hazırlanıyor..."} disabled={!cryptoReady}
            className="chat-message-input max-h-[120px] min-h-[46px] flex-1 resize-none rounded-2xl px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 disabled:opacity-50" />
          <button type={draft.trim() ? "submit" : "button"} disabled={draft.trim() ? sending || !cryptoReady : true} aria-label={draft.trim() ? "Mesaj gönder" : "Sesli mesaj yakında"} title={draft.trim() ? "Gönder" : "Sesli mesaj yakında"} className="send-button mb-0.5">
            {draft.trim() ? <Send size={19} /> : <Mic size={20} />}
          </button>
        </form>
        <div className="pb-2 text-center text-[10px] text-slate-600 sm:pb-2">NOVA · AES-256-GCM ile uçtan uca şifreli iletişim</div>
      </section>
    </main>
  );
}
