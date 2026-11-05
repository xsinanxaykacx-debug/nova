"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, MessageCircle, Plus, CheckCheck } from "lucide-react";
import { NavigationRail } from "@/components/navigation-rail";
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
  return name.trim().split(" ").filter(Boolean).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "N";
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
  const [items, setItems] = useState<ChatItem[]>([]);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const markRead = useCallback((id: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(`nova-chat-read:${id}`, new Date().toISOString());
    setItems((current) => current.map((item) => item.id === id ? { ...item, unread: 0 } : item));
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function loadChats() {
      setLoading(true);
      const { data: memberships, error: membershipError } = await supabase
        .from("conversation_members").select("conversation_id").eq("user_id", user!.id);
      if (!active) return;
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
        return { id, peerId, name: peer.display_name || peer.username || "KullanÄ±cÄ±", username: peer.username || "", avatarUrl: peer.avatar_url ?? null, lastAt, unread } satisfies ChatItem;
      }));
      if (!active) return;
      setItems(results.filter((item): item is ChatItem => item !== null).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "")));
      setLoading(false);
    }
    void loadChats();
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => { if (activeConversationId) markRead(activeConversationId); }, [activeConversationId, markRead]);

  const filtered = items.filter((item) => `${item.name} ${item.username}`.toLocaleLowerCase("tr-TR").includes(term.toLocaleLowerCase("tr-TR")));

  return (
    <div className="chat-sidebar-layout flex h-full w-full min-w-0 shrink-0">
      <NavigationRail showMobileNav={!activeConversationId} />
      <aside className={`chat-sidebar flex h-full min-h-0 min-w-0 flex-col border-r border-slate-700/70 ${activeConversationId ? "hidden md:flex" : "flex"}`}>
        <div className="chat-list-heading flex h-[76px] shrink-0 items-center justify-between px-6">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-100">Sohbetler</h1>
          <Link href="/search" aria-label="Yeni sohbet" title="Yeni sohbet" className="chat-new-button"><Plus size={22} /></Link>
        </div>
        <div className="chat-search-wrap shrink-0 px-5 pb-4">
          <label className="search-field chat-search-field">
            <Search size={19} className="shrink-0 text-slate-400" />
            <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Ara veya yeni sohbet baÅŸlat" aria-label="Sohbetlerde ara" />
          </label>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Sohbet listesi">
          {loading ? <div className="px-6 py-8 text-sm text-slate-400">Sohbetler yÃ¼kleniyor...</div> : filtered.length ? filtered.map((item) => (
            <Link key={item.id} href={`/chat/${item.id}`} onClick={() => markRead(item.id)} className={`chat-list-item ${activeConversationId === item.id ? "chat-list-item-active" : ""}`}>
              <div className="avatar-ring avatar-ring-large chat-list-avatar">{item.avatarUrl ? <Image src={item.avatarUrl} alt="" width={52} height={52} unoptimized className="h-full w-full rounded-full object-cover" /> : <span>{initials(item.name)}</span>}</div>
              <div className="chat-list-copy min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[16px] font-medium text-slate-100">{item.name}</p>
                  <time className={`shrink-0 text-[11px] ${item.unread ? "text-sky-400" : "text-slate-400"}`}>{timeLabel(item.lastAt)}</time>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-slate-400"><CheckCheck size={14} className="shrink-0 text-slate-500" />{item.lastAt ? "UÃ§tan uca ÅŸifreli mesaj" : "Sohbet baÅŸladÄ±"}</p>
                  {item.unread > 0 && <span className="unread-badge">{item.unread > 99 ? "99+" : item.unread}</span>}
                </div>
              </div>
            </Link>
          )) : <div className="px-6 py-12 text-center"><MessageCircle size={30} className="mx-auto mb-3 text-slate-500" /><p className="text-sm text-slate-300">{term ? "EÅŸleÅŸen sohbet yok." : "HenÃ¼z sohbetin yok."}</p><Link href="/search" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-sky-400 hover:text-sky-300"><Plus size={16} /> Yeni sohbet baÅŸlat</Link></div>}
        </nav>
      </aside>
    </div>
  );
}
