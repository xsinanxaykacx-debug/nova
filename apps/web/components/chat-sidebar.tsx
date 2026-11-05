"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Search, MessageCircle, Settings, UserRound, Plus, MoreVertical, CheckCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ChatItem = {
  id: string;
  peerId: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  lastAt: string | null;
  unread: number;
};

function initials(name: string) {
  return name.trim().split(/\\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "N";
}

function timeLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

export function ChatSidebar({ activeConversationId }: { activeConversationId?: string }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [term, setTerm] = useState("");
  const [displayName, setDisplayName] = useState("NOVA kullanıcısı");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const markRead = useCallback((id: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`nova-chat-read:${id}`, new Date().toISOString());
    }
    setItems((current) => current.map((item) => item.id === id ? { ...item, unread: 0 } : item));
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function loadChats() {
      setLoading(true);
      const [{ data: ownProfile }, { data: memberships, error: membershipError }] = await Promise.all([
        supabase.from("profiles").select("display_name, username, avatar_url").eq("id", user!.id).maybeSingle(),
        supabase.from("conversation_members").select("conversation_id").eq("user_id", user!.id),
      ]);
      if (!active) return;
      setDisplayName(ownProfile?.display_name || ownProfile?.username || "NOVA kullanıcısı");
      setAvatarUrl(ownProfile?.avatar_url ?? null);
      if (membershipError || !memberships?.length) {
        setItems([]);
        setLoading(false);
        return;
      }
      const ids = memberships.map((entry) => entry.conversation_id);
      const results = await Promise.all(ids.map(async (id) => {
        const [{ data: members }, { data: messages }] = await Promise.all([
          supabase.from("conversation_members").select("user_id").eq("conversation_id", id).neq("user_id", user!.id),
          supabase.from("messages").select("sender_id, created_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(100),
        ]);
        const peerId = members?.[0]?.user_id;
        if (!peerId) return null;
        const { data: peer } = await supabase.from("profiles").select("display_name, username, avatar_url").eq("id", peerId).maybeSingle();
        if (!peer) return null;
        const lastAt = messages?.[0]?.created_at ?? null;
        const lastRead = typeof window !== "undefined" ? window.localStorage.getItem(`nova-chat-read:${id}`) : null;
        const unread = messages?.filter((message) => message.sender_id !== user!.id && (!lastRead || new Date(message.created_at).getTime() > new Date(lastRead).getTime())).length ?? 0;
        return { id, peerId, name: peer.display_name || peer.username || "Kullanıcı", username: peer.username || "", avatarUrl: peer.avatar_url ?? null, lastAt, unread } satisfies ChatItem;
      }));
      if (!active) return;
      setItems(results.filter((item): item is ChatItem => item !== null).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "")));
      setLoading(false);
    }
    void loadChats();
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => {
    if (activeConversationId) markRead(activeConversationId);
  }, [activeConversationId, markRead]);

  const filtered = items.filter((item) => `${item.name} ${item.username}`.toLocaleLowerCase("tr-TR").includes(term.toLocaleLowerCase("tr-TR")));

  return (
    <aside className={`chat-sidebar flex h-full min-h-0 w-full flex-col border-r border-slate-800/90 bg-[#0b1422] ${activeConversationId ? "hidden md:flex md:w-[340px] md:shrink-0" : "md:w-[360px] md:shrink-0"}`}>
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <div className="avatar-ring">
            {avatarUrl ? <Image src={avatarUrl} alt="" width={42} height={42} unoptimized className="h-full w-full rounded-full object-cover" /> : <span>{initials(displayName)}</span>}
          </div>
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{displayName}</p><p className="text-[11px] text-slate-500">Güvenli sohbet alanı</p></div>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <Link href="/search" aria-label="Yeni sohbet" title="Yeni sohbet" className="icon-button"><Plus size={19} /></Link>
          <Link href="/profile" aria-label="Ayarlar ve profil" title="Ayarlar ve profil" className="icon-button"><Settings size={18} /></Link>
          <button type="button" aria-label="Diğer seçenekler" className="icon-button"><MoreVertical size={18} /></button>
        </div>
      </div>
      <div className="px-4 pb-4">
        <label className="search-field">
          <Search size={17} className="shrink-0 text-sky-400" />
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Sohbetlerde ara" aria-label="Sohbetlerde ara" />
        </label>
      </div>
      <div className="flex items-center justify-between px-5 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Mesajlar</span>
        <span className="text-[11px] text-slate-600">{items.length} sohbet</span>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto pb-3" aria-label="Sohbet listesi">
        {loading ? <div className="px-5 py-8 text-sm text-slate-500">Sohbetler yükleniyor...</div> : filtered.length ? filtered.map((item) => (
          <Link key={item.id} href={`/chat/${item.id}`} onClick={() => markRead(item.id)} className={`chat-list-item ${activeConversationId === item.id ? "chat-list-item-active" : ""}`}>
            <div className="avatar-ring avatar-ring-large">{item.avatarUrl ? <Image src={item.avatarUrl} alt="" width={46} height={46} unoptimized className="h-full w-full rounded-full object-cover" /> : <span>{initials(item.name)}</span>}</div>
            <div className="min-w-0 flex-1 border-b border-slate-800/60 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[14px] font-semibold text-slate-100">{item.name}</p>
                <time className={`shrink-0 text-[10px] ${item.unread ? "text-sky-400" : "text-slate-500"}`}>{timeLabel(item.lastAt)}</time>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1 truncate text-xs text-slate-500"><CheckCheck size={13} className="shrink-0 text-sky-500" />{item.lastAt ? "Uçtan uca şifreli mesaj" : "Sohbet başladı"}</p>
                {item.unread > 0 && <span className="unread-badge">{item.unread > 99 ? "99+" : item.unread}</span>}
              </div>
            </div>
          </Link>
        )) : <div className="px-5 py-10 text-center"><MessageCircle size={25} className="mx-auto mb-3 text-slate-600" /><p className="text-sm text-slate-400">{term ? "Eşleşen sohbet yok." : "Henüz sohbetin yok."}</p><Link href="/search" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-sky-400 hover:text-sky-300"><Plus size={14} /> Yeni sohbet başlat</Link></div>}
      </nav>
      <div className="mobile-bottom-nav grid grid-cols-3 border-t border-slate-800/80 px-3 py-2 md:hidden">
        <Link href="/chat" className={`mobile-nav-link ${pathname.startsWith("/chat") ? "mobile-nav-active" : ""}`}><MessageCircle size={19} />Sohbet</Link>
        <Link href="/search" className="mobile-nav-link"><Search size={19} />Keşfet</Link>
        <Link href="/profile" className="mobile-nav-link"><UserRound size={19} />Profil</Link>
      </div>
    </aside>
  );
}
