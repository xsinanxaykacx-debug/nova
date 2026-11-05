"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Message } from "@nova/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ChatRoomProps = {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
};

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value: string) {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "Bu mesaj çözümlenemedi.";
  }
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map<string, Message>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort((left, right) => {
    const difference = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    return difference || left.id.localeCompare(right.id);
  });
}

export function ChatRoom({ conversationId, currentUserId, initialMessages }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "live" | "error">("connecting");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const addMessages = useCallback((next: Message[]) => {
    setMessages((current) => mergeMessages(current, next));
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function connectToRealtime() {
      setConnection("connecting");
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError || !session?.access_token) {
        console.error("Realtime auth session unavailable:", sessionError?.message);
        setConnection("error");
        setError("Canlı bağlantı için oturum doğrulanamadı. Sayfayı yenileyip tekrar dene.");
        return;
      }

      // Make sure the Realtime websocket uses the same authenticated JWT as PostgREST.
      await supabase.realtime.setAuth(session.access_token);
      if (!active) return;

      channel = supabase
        .channel(`conversation:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            if (!active) return;
            const incoming = payload.new as Message;
            // Filter locally: avoids a server-side UUID filter mismatch while keeping
            // the RLS-protected Realtime stream scoped to rows this user can read.
            if (incoming.conversation_id === conversationId) addMessages([incoming]);
          },
        )
        .subscribe(async (status, subscriptionError) => {
          if (!active) return;
          if (status === "SUBSCRIBED") {
            setConnection("live");
            setError("");
            // Reconcile history after joining the channel to close the hydration race.
            const { data, error: historyError } = await supabase
              .from("messages")
              .select("id, conversation_id, sender_id, ciphertext, sender_device_id, created_at")
              .eq("conversation_id", conversationId)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .limit(100);
            if (!active) return;
            if (historyError) {
              setError("Mesaj geçmişi yenilenemedi. Canlı bağlantı devam ediyor.");
            } else {
              addMessages((data ?? []) as Message[]);
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            console.error("Realtime subscription status:", status, subscriptionError);
            setConnection("error");
            setError("Canlı bağlantı kesildi. Bağlantını kontrol edip sayfayı yenile.");
          }
        });
    }

    void connectToRealtime();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [addMessages, conversationId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    if (text.length > 4000) {
      setError("Mesaj en fazla 4000 karakter olabilir.");
      return;
    }

    setSending(true);
    setError("");
    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        ciphertext: encodeBase64(text),
        // Temporary MVP-04 identifier; MVP-05 will register real device UUIDs.
        sender_device_id: currentUserId,
      })
      .select("id, conversation_id, sender_id, ciphertext, sender_device_id, created_at")
      .single();
    setSending(false);

    if (insertError || !data) {
      setError("Mesaj gönderilemedi. Bağlantını kontrol edip tekrar dene.");
      return;
    }
    addMessages([data as Message]);
    setDraft("");
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 px-4 py-5 sm:px-6">
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/20">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <Link href="/search" className="text-xs font-semibold text-violet-300 hover:text-violet-200">← Kullanıcılar</Link>
            <h1 className="mt-1 truncate text-lg font-semibold text-white">Sohbet</h1>
            <p className="mt-0.5 text-xs text-slate-500">NOVA CHAT · {conversationId.slice(0, 8)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${connection === "live" ? "bg-emerald-400" : connection === "error" ? "bg-rose-400" : "bg-amber-400"}`} />
            <span className="text-slate-400">{connection === "live" ? "Canlı" : connection === "error" ? "Bağlantı sorunu" : "Bağlanıyor..."}</span>
          </div>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite" aria-label="Mesaj geçmişi">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-64 items-center justify-center text-center">
              <div>
                <p className="font-medium text-slate-300">Sohbet başlatıldı</p>
                <p className="mt-2 text-sm text-slate-500">İlk mesajı sen gönder.</p>
              </div>
            </div>
          ) : messages.map((message) => {
            const own = message.sender_id === currentUserId;
            return (
              <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                <article className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[75%] ${own ? "rounded-br-md bg-violet-600 text-white" : "rounded-bl-md border border-slate-700 bg-slate-800 text-slate-100"}`}>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{decodeBase64(message.ciphertext)}</p>
                  <p className={`mt-1.5 text-right text-[10px] ${own ? "text-violet-200/80" : "text-slate-500"}`}>
                    {new Date(message.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </article>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        {error && <p role="status" className="mx-4 mb-2 rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-xs text-rose-200 sm:mx-6">{error}</p>}
        <form onSubmit={sendMessage} className="flex items-end gap-3 border-t border-slate-800 p-4 sm:p-5">
          <label className="sr-only" htmlFor="chat-message">Mesajın</label>
          <textarea
            id="chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Mesajını yaz..."
            className="max-h-32 min-h-12 flex-1 resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400"
          />
          <button type="submit" disabled={sending || !draft.trim()} className="h-12 shrink-0 rounded-xl bg-violet-500 px-5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50">
            {sending ? "Gönderiliyor..." : "Gönder"}
          </button>
        </form>
      </section>
      <p className="mx-auto mt-3 max-w-3xl text-center text-[11px] text-slate-600">MVP-04 geçici Base64 aktarımı kullanır; Base64 gerçek şifreleme değildir.</p>
    </main>
  );
}
