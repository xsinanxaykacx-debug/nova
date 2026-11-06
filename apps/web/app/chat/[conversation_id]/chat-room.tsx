"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, CheckCheck, LockKeyhole, Camera, Send, Phone, UserRound, Paperclip, Mic, X, Download, MoreVertical, Trash2 } from "lucide-react";
import type { Message } from "@nova/types";
import { decrypt, deriveConversationKey, encrypt, getOrCreateIdentity, unwrapGroupKey } from "@nova/crypto";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ChatSidebar } from "@/components/chat-sidebar";

type EncryptedMediaPayload = { version: 1; name: string; mimeType: string; size: number; data: string };
const MAX_MEDIA_BYTES = 300 * 1024;

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    }
    return btoa(binary);
  });
}

type GroupParticipant = { id: string; display_name: string; username: string; avatar_url: string | null };
type ChatRoomProps = {
  conversationId: string;
  currentUserId: string;
  conversationType: "direct" | "group";
  peerPublicKey: string | null;
  peerName: string;
  peerUsername: string;
  peerAvatarUrl: string | null;
  groupEncryptedKey?: string | null;
  groupKeySenderPublicKey?: string | null;
  groupMemberCount?: number;
  groupParticipants?: GroupParticipant[];
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

export function ChatRoom({ conversationId, currentUserId, conversationType, peerPublicKey, peerName, peerUsername, peerAvatarUrl, groupEncryptedKey, groupKeySenderPublicKey, groupMemberCount, groupParticipants = [], initialMessages }: ChatRoomProps) {
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<BlobPart[]>([]);

  const addMessages = useCallback((next: Message[]) => {
    setMessages((current) => mergeMessages(current, next));
  }, []);

  useEffect(() => {
    let active = true;
    setCryptoReady(false);
    setSharedKey(null);

    async function initializeEncryption() {
      try {
        const identity = await getOrCreateIdentity(currentUserId);
        const { error: publishError } = await supabase.from("profiles").update({ public_key: identity.publicKey }).eq("id", currentUserId);
        if (publishError) throw new Error("Açık anahtar profiline kaydedilemedi: " + publishError.message);
        let key: CryptoKey;
        if (conversationType === "group") {
          if (!groupEncryptedKey || !groupKeySenderPublicKey) throw new Error("Bu grup için sana ait şifreli grup anahtarı bulunamadı.");
          key = await unwrapGroupKey(groupEncryptedKey, identity.privateKey, groupKeySenderPublicKey, conversationId);
        } else {
          if (!peerPublicKey) throw new Error("Karşı tarafın açık anahtarı henüz hazır değil. Diğer kullanıcının giriş yapmasını bekle veya sohbeti yenile.");
          key = await deriveConversationKey(identity.privateKey, peerPublicKey, conversationId);
        }
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
  }, [conversationId, conversationType, currentUserId, groupEncryptedKey, groupKeySenderPublicKey, peerPublicKey, supabase]);

  useEffect(() => {
    if (!sharedKey) return;
    const activeKey = sharedKey;
    async function decryptPendingMessages() {
      const pending = messages.filter((message) => !message.deleted_at && !decryptedIds.current.has(message.id) && !decryptingIds.current.has(message.id));
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
      event: "*", schema: "public", table: "messages",
    }, (payload) => {
      if (!active) return;
      const incoming = payload.new as Message;
      if (incoming.conversation_id === conversationId) addMessages([incoming]);
    }).subscribe(async (status, subscriptionError) => {
      if (!active) return;
      if (status === "SUBSCRIBED") {
        setConnection("live");
        const { data, error: historyError } = await supabase.from("messages")
          .select("id, conversation_id, sender_id, ciphertext, sender_device_id, type, created_at, deleted_at")
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

  async function deleteMessage(message: Message) {
    if (message.sender_id !== currentUserId || message.deleted_at) return;
    if (!window.confirm("Bu mesajı silmek istiyor musun?")) return;
    setMenuMessageId(null);
    const deletedAt = new Date().toISOString();
    const { data, error: deleteError } = await supabase.from("messages")
      .update({ deleted_at: deletedAt })
      .eq("id", message.id).eq("sender_id", currentUserId).is("deleted_at", null)
      .select("id, conversation_id, sender_id, ciphertext, sender_device_id, type, created_at, deleted_at")
      .maybeSingle();
    if (deleteError || !data) {
      setError(deleteError?.message || "Mesaj silinemedi. Yalnızca kendi mesajlarını silebilirsin.");
      return;
    }
    addMessages([data as Message]);
  }

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
        conversation_id: conversationId, sender_id: currentUserId, ciphertext, sender_device_id: currentUserId, type: "text",
      }).select("id, conversation_id, sender_id, ciphertext, sender_device_id, type, created_at, deleted_at").single();
      if (insertError || !data) throw new Error(insertError?.message ?? "Şifreli mesaj veritabanına kaydedilemedi.");
      addMessages([data as Message]);
      setDraft("");
      if (inputRef.current) inputRef.current.style.height = "auto";
    } catch (sendError) {
      console.error("E2EE message send failed:", sendError);
      setError(sendError instanceof Error ? sendError.message : "Şifreli mesaj gönderilemedi.");
    } finally { setSending(false); }
  }


  async function sendMediaBlob(blob: Blob, type: "audio" | "file", name: string) {
    if (!blob.size) throw new Error("Gönderilecek medya boş.");
    if (blob.size > MAX_MEDIA_BYTES) throw new Error("Bu sürümde ses veya dosya boyutu en fazla 300 KB olabilir.");
    if (!sharedKey || !cryptoReady) throw new Error("Uçtan uca şifreleme henüz hazır değil.");
    setSending(true);
    setError("");
    try {
      const payload: EncryptedMediaPayload = {
        version: 1, name, mimeType: blob.type || "application/octet-stream",
        size: blob.size, data: await blobToBase64(blob),
      };
      const ciphertext = await encrypt(JSON.stringify(payload), sharedKey, conversationId);
      // Fail closed: never persist media unless encryption returned a NOVA1 envelope.
      if (!ciphertext.startsWith("NOVA1:")) {
        throw new Error("Medya E2EE zarfı doğrulanamadı; gönderim durduruldu.");
      }
      const { data, error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversationId, sender_id: currentUserId, ciphertext,
        sender_device_id: currentUserId, type,
      }).select("id, conversation_id, sender_id, ciphertext, sender_device_id, type, created_at, deleted_at").single();
      if (insertError || !data) throw new Error(insertError?.message ?? "Şifreli medya veritabanına kaydedilemedi.");
      addMessages([data as Message]);
    } finally { setSending(false); }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try { await sendMediaBlob(file, "file", file.name); }
    catch (fileError) {
      console.error("E2EE file send failed:", fileError);
      setError(fileError instanceof Error ? fileError.message : "Şifreli dosya gönderilemedi.");
    } finally { input.value = ""; }
  }

  async function toggleRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      return;
    }
    if (sending || !cryptoReady) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Bu tarayıcı ses kaydını desteklemiyor.");
      return;
    }
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMime = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = new MediaRecorder(stream, supportedMime
        ? { mimeType: supportedMime, audioBitsPerSecond: 32000 }
        : { audioBitsPerSecond: 32000 });
      recorderChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recorderChunksRef.current.push(event.data); };
      recorder.onerror = () => setError("Ses kaydı sırasında bir hata oluştu.");
      recorder.onstop = () => {
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        recorderChunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
        void sendMediaBlob(blob, "audio", `ses-${Date.now()}.${extension}`).catch((recordError) => {
          console.error("E2EE audio send failed:", recordError);
          setError(recordError instanceof Error ? recordError.message : "Şifreli ses gönderilemedi.");
        });
      };
      mediaStreamRef.current = stream;
      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch (recordError) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setError(recordError instanceof Error ? recordError.message : "Mikrofon açılamadı. İzinleri kontrol et.");
    }
  }

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  return (
    <main className="chat-app-shell flex h-[100dvh] min-h-[560px] overflow-hidden bg-[#07111f] text-slate-100">
      <ChatSidebar activeConversationId={conversationId} />
      <section className="chat-room-panel flex min-w-0 flex-1 flex-col">
        <header className="chat-room-header flex h-[76px] shrink-0 items-center justify-between border-b border-slate-800/80 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/chat" aria-label="Geri, sohbet listesine dön" className="icon-button inline-flex items-center gap-1.5 px-2 md:hidden"><ArrowLeft size={20} /><span className="text-sm font-medium">Geri</span></Link>
            <button type="button" onClick={() => setProfileOpen(true)} aria-haspopup="dialog" aria-label={"Kullan\u0131c\u0131 profilini a\u00E7"} className="conversation-profile-card flex min-w-0 items-center gap-3 rounded-2xl px-4 py-2 text-left transition hover:border-sky-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
              <div className="avatar-ring avatar-ring-large conversation-profile-avatar">{peerAvatarUrl ? <Image src={peerAvatarUrl} alt="" width={58} height={58} unoptimized className="h-full w-full rounded-full object-cover" /> : <span>{initials(peerName)}</span>}</div>
              <div className="min-w-0"><h1 className="truncate text-base font-semibold text-slate-100">{peerName}</h1><p className="mt-1 truncate text-xs text-slate-300">{conversationType === "group" ? `${groupMemberCount ?? groupParticipants.length} üye` : peerUsername ? "@" + peerUsername : "NOVA kullanıcısı"}</p><p className="conversation-status mt-1 flex items-center gap-1.5 text-[11px]"><span className={`conversation-status-dot ${connection === "live" ? "is-live" : connection === "error" ? "is-error" : ""}`} />{connection === "live" ? "Çevrimiçi" : connection === "error" ? "Ba\u011Flant\u0131 sorunu" : "Ba\u011Flan\u0131yor"}</p></div>
            </button>
          </div>
          <div className="chat-header-actions flex items-center gap-2"><span className={`mr-1 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] sm:inline-flex ${cryptoReady ? "text-slate-300" : "text-slate-500"}`}><LockKeyhole size={12} />{cryptoReady ? "Uçtan uca şifreli" : "Şifreleme hazırlanıyor"}</span><button type="button" disabled aria-label="Arama" title="Arama" className="nova-header-action"><Phone size={16} /></button><button type="button" onClick={() => setProfileOpen(true)} aria-label="Profil" title="Profil" className="nova-header-action"><UserRound size={16} /></button></div>
        </header>

        <div className="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-8 sm:py-7" aria-live="polite" aria-label="Şifreli mesaj geçmişi">
          <div className="mx-auto mb-6 flex max-w-xl justify-center"><span className="security-pill"><LockKeyhole size={12} /> Mesajlar uçtan uca şifrelidir. Yalnızca bu sohbetteki kişiler okuyabilir.</span></div>
          {messages.length === 0 ? <div className="flex min-h-[45vh] items-center justify-center text-center"><div className="rounded-2xl border border-slate-700/60 bg-slate-950/60 px-7 py-6 backdrop-blur"><LockKeyhole size={25} className="mx-auto mb-3 text-sky-400" /><p className="font-medium text-slate-200">Güvenli sohbet hazır</p><p className="mt-2 text-sm text-slate-500">İlk şifreli mesajını gönder.</p></div></div> : (
            <div className="mx-auto flex max-w-4xl flex-col gap-2.5">
              {messages.map((message) => {
                const own = message.sender_id === currentUserId;
                const sender = groupParticipants.find((participant) => participant.id === message.sender_id);
                const content = decryptedMessages[message.id];
                let mediaPayload: EncryptedMediaPayload | null = null;
                if (content && message.type !== "text") {
                  try {
                    const parsed = JSON.parse(content) as EncryptedMediaPayload;
                    if (parsed.version === 1 && typeof parsed.data === "string" && typeof parsed.name === "string") mediaPayload = parsed;
                  } catch { mediaPayload = null; }
                }
                return <div key={message.id} className={`flex items-end gap-2 ${own ? "justify-end" : "justify-start"}`}>
                  {conversationType === "group" && !own && <div className="avatar-ring mb-1 h-8 w-8 shrink-0">{sender?.avatar_url ? <Image src={sender.avatar_url} alt="" width={32} height={32} unoptimized className="h-full w-full rounded-full object-cover" /> : <span>{initials(sender?.display_name || sender?.username || "Üye")}</span>}</div>}
                  <article className={`message-bubble relative ${own ? "message-bubble-outgoing" : "message-bubble-incoming"}`}>
                    {conversationType === "group" && <p className={`mb-1 text-[11px] font-semibold ${own ? "text-sky-100/80" : "text-slate-300"}`}>{own ? "Sen" : sender?.display_name || sender?.username || "Grup üyesi"}</p>}
                    {message.deleted_at ? <p className="text-[13px] italic text-slate-400">Bu mesaj silindi</p> : content === undefined ? <p className="text-[14px]">Şifre çözülüyor...</p> : message.type === "text" ? (
                      <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.55]">{content}</p>
                    ) : mediaPayload ? message.type === "audio" ? (
                      <audio controls preload="metadata" className="max-w-full" src={`data:${mediaPayload.mimeType};base64,${mediaPayload.data}`} />
                    ) : (
                      <div className="flex max-w-full items-center gap-3 text-sm">
                        <span className="min-w-0 break-all">{mediaPayload.name}</span>
                        <a className="inline-flex shrink-0 items-center gap-1 underline" href={`data:${mediaPayload.mimeType};base64,${mediaPayload.data}`} download={mediaPayload.name}><Download size={14} />İndir</a>
                      </div>
                    ) : <p className="text-[13px]">Medya içeriği çözülemedi.</p>}
                    <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${own ? "text-sky-100/75" : "text-slate-500"}`}>
                      {own && !message.deleted_at && <button type="button" aria-label="Mesaj seçenekleri" title="Mesaj seçenekleri"
                        onClick={() => setMenuMessageId((current) => current === message.id ? null : message.id)}
                        className="rounded p-1 text-current opacity-70 transition hover:bg-black/10 hover:opacity-100"><MoreVertical size={14} /></button>}
                      <time>{new Date(message.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time>
                      {own && <CheckCheck size={15} className="text-sky-200" aria-label="İletildi" />}
                    </div>
                    {menuMessageId === message.id && own && !message.deleted_at && <div className="absolute bottom-9 right-2 z-30 min-w-36 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-xl">
                      <button type="button" onClick={() => void deleteMessage(message)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-slate-800"><Trash2 size={14} />Mesajı Sil</button>
                    </div>}
                  </article>
                  {conversationType === "group" && own && <div className="avatar-ring mb-1 h-8 w-8 shrink-0">{sender?.avatar_url ? <Image src={sender.avatar_url} alt="" width={32} height={32} unoptimized className="h-full w-full rounded-full object-cover" /> : <span>{initials(sender?.display_name || "Sen")}</span>}</div>}
                </div>;
              })}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p role="status" className="mx-4 mb-2 rounded-xl border border-rose-900/60 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">{error}</p>}
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} aria-label="Gönderilecek dosyayı seç" />
        <form onSubmit={sendMessage} className="chat-composer flex shrink-0 items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
          <button type="button" disabled aria-label="Kamera yakında" title="Kamera yakında" className="composer-icon-button composer-send-leading"><Camera size={21} /></button>
          <label className="sr-only" htmlFor="chat-message">Mesajın</label>
          <textarea id="chat-message" ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
          }} onInput={(event) => { event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 120)}px`; }}
            rows={1} maxLength={4000} placeholder="" disabled={!cryptoReady}
            className="chat-message-input max-h-[120px] min-h-[50px] flex-1 resize-none rounded-[22px] px-5 py-3.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 disabled:opacity-50" />
          <button type="button" disabled={!cryptoReady || sending} onClick={() => fileInputRef.current?.click()} aria-label="Dosya ekle" title="Dosya ekle" className="composer-icon-button hidden sm:inline-flex"><Paperclip size={21} /></button>
          <button type="button" disabled={!cryptoReady || sending} onClick={() => void toggleRecording()} aria-label={recording ? "Kaydı bitir ve gönder" : "Ses kaydet"} title={recording ? "Kaydı bitir ve gönder" : "Ses kaydet"} className="composer-icon-button"><Mic size={21} /></button>
          <button type={draft.trim() ? "submit" : "button"} disabled={draft.trim() ? sending || !cryptoReady : true} aria-label="Mesaj gönder" title="Gönder" className="send-button composer-send-trailing"><Send size={18} /></button>
        </form>

              {profileOpen && <div className="peer-profile-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
          <section className="peer-profile-modal" role="dialog" aria-modal="true" aria-labelledby="peer-profile-title">
            <header className="peer-profile-modal-header"><h2 id="peer-profile-title">Profil bilgileri</h2><button type="button" onClick={() => setProfileOpen(false)} className="new-chat-close" aria-label="Kapat"><X size={20} /></button></header>
            <div className="peer-profile-modal-content">
              <div className="avatar-ring avatar-ring-large peer-profile-avatar">{peerAvatarUrl ? <Image src={peerAvatarUrl} alt={peerName} width={88} height={88} unoptimized className="h-full w-full rounded-full object-cover" /> : <span>{initials(peerName)}</span>}</div>
              <h3>{peerName}</h3><p className="peer-profile-username">{peerUsername ? "@" + peerUsername : "NOVA kullanıcısı"}</p>
              <div className="peer-profile-info-row"><span className={"conversation-status-dot " + (connection === "live" ? "is-live" : connection === "error" ? "is-error" : "")} /><span>{connection === "live" ? "\u00C7evrimi\u00E7i" : connection === "error" ? "Ba\u011Flant\u0131 sorunu" : "Ba\u011Flan\u0131yor"}</span></div>
              <div className="peer-profile-encryption"><LockKeyhole size={18} /><div><strong>Uçtan uca şifreli</strong><p>Bu sohbetteki mesajlar yalnızca sen ve bu kişi tarafından okunabilir.</p></div></div>
            </div>
          </section>
        </div>}
</section>
    </main>
  );
}
