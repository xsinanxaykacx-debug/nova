"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, MessageCircle, Plus, CheckCheck, X, ArrowLeft, UserRound, Settings } from "lucide-react";
import { NavigationRail } from "@/components/navigation-rail";
import { useAuth } from "@/components/auth-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ChatItem = { id: string; peerId: string; name: string; username: string; avatarUrl: string | null; lastAt: string | null; unread: number };
type SearchProfile = { id: string; username: string; display_name: string; avatar_url?: string | null };

function initials(name: string) { return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "N"; }
function timeLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value); const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

export function ChatSidebar({ activeConversationId }: { activeConversationId?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "favorites" | "groups">("all");
  const [loading, setLoading] = useState(true);
  const [inlinePeople, setInlinePeople] = useState<SearchProfile[]>([]);
  const [inlineSearchLoading, setInlineSearchLoading] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [personTerm, setPersonTerm] = useState("");
  const [people, setPeople] = useState<SearchProfile[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleSearched, setPeopleSearched] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [modalError, setModalError] = useState("");
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
      const { data: memberships, error: membershipError } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user!.id);
      if (!active) return;
      if (membershipError || !memberships?.length) { setItems([]); setLoading(false); return; }
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
        const lastAt = messages?.[0]?.created_at || null;
        const lastRead = typeof window !== "undefined" ? window.localStorage.getItem(`nova-chat-read:${id}`) : null;
        const unread = messages?.filter((message) => message.sender_id !== user!.id && (!lastRead || new Date(message.created_at).getTime() > new Date(lastRead).getTime())).length || 0;
        return { id, peerId, name: peer.display_name || peer.username || "Kullanıcı", username: peer.username || "", avatarUrl: peer.avatar_url || null, lastAt, unread } satisfies ChatItem;
      }));
      if (!active) return;
      setItems(results.filter((item): item is ChatItem => item !== null).sort((a, b) => (b.lastAt || "").localeCompare(a.lastAt || "")));
      setLoading(false);
    }
    void loadChats();
    return () => { active = false; };
  }, [supabase, user]);

  useEffect(() => { if (activeConversationId) markRead(activeConversationId); }, [activeConversationId, markRead]);

  useEffect(() => {
    if (!user || term.trim().length < 2) { setInlinePeople([]); setInlineSearchLoading(false); return; }
    let active = true;
    const timer = setTimeout(async () => {
      setInlineSearchLoading(true);
      const safeTerm = term.trim().replace(/[^a-zA-Z0-9_ğüşöçıİĞÜŞÖÇ .-]/g, "").replace(/\s+/g, " ");
      const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url").neq("id", user.id)
        .or(`username.ilike.%${safeTerm}%,display_name.ilike.%${safeTerm}%`).order("username", { ascending: true }).limit(8);
      if (active) { setInlinePeople(data ?? []); setInlineSearchLoading(false); }
    }, 280);
    return () => { active = false; clearTimeout(timer); };
  }, [supabase, term, user]);

  async function searchPeople(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const safeTerm = personTerm.trim().replace(/[^a-zA-Z0-9_ğüşöçıİĞÜŞÖÇ .-]/g, "").replace(/\s+/g, " ");
    if (safeTerm.length < 2) { setModalError("En az 2 karakter gir."); setPeople([]); return; }
    setPeopleLoading(true); setModalError(""); setPeopleSearched(true);
    const { data, error } = await supabase.from("profiles").select("id, username, display_name, avatar_url").neq("id", user.id)
      .or(`username.ilike.%${safeTerm}%,display_name.ilike.%${safeTerm}%`).order("username", { ascending: true }).limit(30);
    setPeopleLoading(false);
    if (error) { setModalError("Kullanıcılar aranırken hata oluştu. Tekrar dene."); setPeople([]); return; }
    setPeople(data || []);
    if (!data?.length) setModalError("Bu aramayla eşleşen kullanıcı bulunamadı.");
  }

  async function startConversation(profile: SearchProfile) {
    if (!user) return;
    setOpeningId(profile.id); setModalError("");
    const { data, error } = await supabase.rpc("create_direct_conversation", { target_user_id: profile.id });
    setOpeningId(null);
    if (error || !data) { setModalError("Sohbet oluşturulamadı. Biraz sonra tekrar dene."); return; }
    setNewChatOpen(false); router.push(`/chat/${data}`);
  }

  const filtered = items.filter((item) => {
    const matchesTerm = `${item.name} ${item.username}`.toLocaleLowerCase("tr-TR").includes(term.toLocaleLowerCase("tr-TR"));
    const matchesFilter = filter === "all" || (filter === "unread" && item.unread > 0);
    return matchesTerm && matchesFilter;
  });

  return (
    <div className={`chat-sidebar-layout flex h-full w-full min-w-0 shrink-0 ${activeConversationId ? "hidden md:flex" : "flex"}`}>
      <NavigationRail showMobileNav={!activeConversationId} />
      <aside className={`chat-sidebar flex h-full min-h-0 min-w-0 flex-col border-r border-slate-700/70 ${activeConversationId ? "hidden md:flex" : "flex"}`}>
        <div className="chat-list-heading flex h-[76px] shrink-0 items-center justify-between gap-3 px-6">
          <h1 className="text-[24px] font-semibold tracking-tight text-slate-100">Sohbet</h1>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => document.getElementById("chat-search-input")?.focus()} aria-label="Sohbetlerde ara" title="Ara" className="icon-button"><Search size={19} /></button>
            <button type="button" disabled aria-label="Ayarlar yakında" title="Ayarlar yakında" className="icon-button opacity-60"><Settings size={19} /></button>
            <button type="button" onClick={() => { setNewChatOpen(true); setPersonTerm(""); setPeople([]); setPeopleSearched(false); setModalError(""); }} aria-label="Yeni sohbet" title="Yeni sohbet" className="chat-new-button"><Plus size={22} /></button>
          </div>
        </div>
        <div className="chat-search-wrap shrink-0 px-5 pb-4">
          <label className="search-field chat-search-field"><Search size={19} className="shrink-0 text-slate-400" /><input id="chat-search-input" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Kişi veya sohbet ara" aria-label="Kişi veya sohbet ara" /></label>
        </div>
        <div className="chat-filter-row flex shrink-0 items-center gap-2 overflow-x-auto px-5 pb-4" aria-label="Sohbet filtreleri">
          {([["all", "Tümü"], ["unread", "Okunmamış"], ["favorites", "Favoriler"], ["groups", "Gruplar"]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`chat-filter-pill ${filter === key ? "chat-filter-pill-active" : ""}`}>{label}</button>)}
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Sohbet listesi">
          {term.trim().length >= 2 && <section className="inline-people-results" aria-label="Kişi arama sonuçları">
            <p className="inline-people-heading">KİŞİLER {inlineSearchLoading ? "· aranıyor" : ""}</p>
            {inlinePeople.map((person) => <button key={person.id} type="button" onClick={() => void startConversation(person)} disabled={openingId !== null} className="new-chat-person">
              <span className="avatar-ring">{person.avatar_url ? <Image src={person.avatar_url} alt="" width={42} height={42} unoptimized className="h-full w-full rounded-full object-cover" /> : initials(person.display_name || person.username)}</span>
              <span className="min-w-0 flex-1 text-left"><strong>{person.display_name || person.username}</strong><small>@{person.username}</small></span>
              <span className="new-chat-action">{openingId === person.id ? "Açılıyor..." : "Mesaj"}</span>
            </button>)}
            {!inlineSearchLoading && inlinePeople.length === 0 && <p className="inline-people-empty">Eşleşen kişi bulunamadı.</p>}
          </section>}
          {loading ? <div className="px-6 py-8 text-sm text-slate-400">Sohbetler yükleniyor...</div> : filtered.length ? filtered.map((item) => (
            <Link key={item.id} href={`/chat/${item.id}`} onClick={() => markRead(item.id)} className={`chat-list-item ${activeConversationId === item.id ? "chat-list-item-active" : ""}`}>
              <div className="avatar-ring avatar-ring-large chat-list-avatar">{item.avatarUrl ? <Image src={item.avatarUrl} alt="" width={52} height={52} unoptimized className="h-full w-full rounded-full object-cover" /> : <span>{initials(item.name)}</span>}</div>
              <div className="chat-list-copy min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate text-[16px] font-medium text-slate-100">{item.name}</p><time className={`shrink-0 text-[11px] ${item.unread ? "text-sky-400" : "text-slate-400"}`}>{timeLabel(item.lastAt)}</time></div>
                <div className="mt-1.5 flex items-center justify-between gap-2"><p className="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-slate-400"><CheckCheck size={14} className="shrink-0 text-slate-500" />{item.lastAt ? "Uçtan uca şifreli mesaj" : "Sohbet başladı"}</p>{item.unread > 0 && <span className="unread-badge">{item.unread > 99 ? "99+" : item.unread}</span>}</div>
              </div>
            </Link>
          )) : <div className="px-6 py-12 text-center"><MessageCircle size={30} className="mx-auto mb-3 text-slate-500" /><p className="text-sm text-slate-300">{filter === "favorites" ? "Henüz favori sohbetin yok." : filter === "groups" ? "Grup sohbeti bulunmuyor." : filter === "unread" ? "Okunmamış sohbet yok." : term ? "Eşleşen sohbet yok." : "Henüz sohbetin yok."}</p>{filter === "all" && <button type="button" onClick={() => setNewChatOpen(true)} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-sky-400 hover:text-sky-300"><Plus size={16} /> Yeni sohbet başlat</button>}</div>}
        </nav>
      </aside>

      {newChatOpen && <div className="new-chat-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewChatOpen(false); }}>
        <section className="new-chat-modal" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
          <header className="new-chat-modal-header"><div className="flex items-center gap-3"><button type="button" onClick={() => setNewChatOpen(false)} className="new-chat-close" aria-label="Kapat"><ArrowLeft size={20} /></button><h2 id="new-chat-title">Yeni sohbet</h2></div><button type="button" onClick={() => setNewChatOpen(false)} className="new-chat-close" aria-label="Kapat"><X size={19} /></button></header>
          <form onSubmit={searchPeople} className="new-chat-search"><Search size={19} /><input autoFocus value={personTerm} onChange={(event) => setPersonTerm(event.target.value)} placeholder="İsim veya kullanıcı adı ara" aria-label="Kişi ara" /><button type="submit" disabled={peopleLoading}>{peopleLoading ? "..." : "Ara"}</button></form>
          <div className="new-chat-results">
            {!peopleSearched && <div className="new-chat-hint"><UserRound size={30} /><p>Yeni bir sohbet başlatmak için kişi ara.</p></div>}
            {people.map((person) => <button key={person.id} type="button" onClick={() => void startConversation(person)} disabled={openingId !== null} className="new-chat-person">
              <span className="avatar-ring">{person.avatar_url ? <Image src={person.avatar_url} alt="" width={42} height={42} unoptimized className="h-full w-full rounded-full object-cover" /> : initials(person.display_name || person.username)}</span>
              <span className="min-w-0 flex-1 text-left"><strong>{person.display_name || person.username}</strong><small>@{person.username}</small></span>
              <span className="new-chat-action">{openingId === person.id ? "Açılıyor..." : "Mesaj"}</span>
            </button>)}
            {modalError && <p role="status" className="new-chat-error">{modalError}</p>}
          </div>
        </section>
      </div>}
    </div>
  );
}
