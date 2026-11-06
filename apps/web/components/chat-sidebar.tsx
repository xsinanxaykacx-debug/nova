"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, MessageCircle, MessageCirclePlus, Plus, CheckCheck, X, ArrowLeft, UserRound, MoreVertical, Trash2, LogOut, Archive, Pin, Star, Bell } from "lucide-react";
import { createGroupKey, getOrCreateIdentity, wrapGroupKey } from "@nova/crypto";
import { NavigationRail } from "@/components/navigation-rail";
import { useAuth } from "@/components/auth-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ChatItem = { id: string; type: "direct" | "group"; groupVersion: number; peerId: string; name: string; username: string; avatarUrl: string | null; memberCount: number; lastAt: string | null; unread: number; archivedAt: string | null; pinnedAt: string | null; favoriteAt: string | null; lastReadAt: string | null };
type SearchProfile = { id: string; username: string; display_name: string; avatar_url?: string | null; public_key?: string | null };

function initials(name: string) { return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "N"; }
function timeLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value); const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

export function ChatSidebar({ activeConversationId }: { activeConversationId?: string }) {
  const { user } = useAuth();
  const userId = user?.id;
  const router = useRouter();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "favorites" | "groups" | "archived">("all");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [inlinePeople, setInlinePeople] = useState<SearchProfile[]>([]);
  const [inlineSearchLoading, setInlineSearchLoading] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [personTerm, setPersonTerm] = useState("");
  const [people, setPeople] = useState<SearchProfile[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleSearched, setPeopleSearched] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [menuConversationId, setMenuConversationId] = useState<string | null>(null);
  const [modalError, setModalError] = useState("");
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupAvatarUrl, setGroupAvatarUrl] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const markRead = useCallback((id: string) => {
    const lastReadAt = new Date().toISOString();
    void supabase.from("conversation_members").update({ unread_at: null, last_read_at: lastReadAt })
      .eq("conversation_id", id).eq("user_id", userId).is("left_at", null)
      .then(({ error }) => { if (error) setLoadError("Okundu bilgisi kaydedilemedi."); });
    setItems((current) => current.map((item) => item.id === id ? { ...item, unread: 0, lastReadAt } : item));
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) { setItems([]); setLoading(false); return; }
    let active = true;
    async function loadChats() {
      setLoading(true);
      setLoadError("");
      try {
        const { data: memberships, error: membershipError } = await supabase.from("conversation_members")
          .select("conversation_id, hidden_at, archived_at, pinned_at, favorite_at, unread_at, cleared_at, last_read_at").eq("user_id", userId).is("left_at", null);
        if (membershipError) throw membershipError;
        if (!memberships?.length) { if (active) setItems([]); return; }
        const ids = memberships.map((entry) => entry.conversation_id);
        const memberState = new Map(memberships.map((entry) => [entry.conversation_id, entry]));
        const hiddenIds = new Set(memberships.filter((entry) => entry.hidden_at).map((entry) => entry.conversation_id));
        const { data: conversations, error: conversationsError } = await supabase.from("conversations")
          .select("id, type, name, avatar_url, group_key_version").in("id", ids);
        if (conversationsError) throw conversationsError;
        const results = await Promise.all((conversations ?? []).map(async (conversation) => {
          const membership = memberState.get(conversation.id);
          const lastReadAt = membership?.last_read_at ?? new Date(0).toISOString();
          const [{ data: members, error: membersError }, { data: messages, error: messagesError }, { count: unreadCount, error: unreadError }] = await Promise.all([
            supabase.from("conversation_members").select("user_id").eq("conversation_id", conversation.id).is("left_at", null),
            supabase.from("messages").select("sender_id, created_at").eq("conversation_id", conversation.id)
              .order("created_at", { ascending: false }).limit(100),
            supabase.from("messages").select("id", { count: "exact", head: true })
              .eq("conversation_id", conversation.id).neq("sender_id", userId).gt("created_at", lastReadAt),
          ]);
          if (membersError) throw membersError;
          if (messagesError) throw messagesError;
          if (unreadError) throw unreadError;
          const otherIds = (members ?? []).map((member) => member.user_id).filter((id) => id !== userId);
          const { data: profiles, error: profilesError } = await supabase.from("profiles")
            .select("id, display_name, username, avatar_url").in("id", otherIds);
          if (profilesError) throw profilesError;
          const lastAt = messages?.[0]?.created_at || null;
          const unread = membership?.unread_at ? Math.max(unreadCount ?? 0, 1) : (unreadCount ?? 0);
          if (conversation.type === "group") {
            return {
              id: conversation.id, type: "group" as const, groupVersion: conversation.group_key_version ?? 1, peerId: otherIds[0] || userId,
              name: conversation.name || "Grup sohbeti", username: `${(members ?? []).length} üye`,
              avatarUrl: conversation.avatar_url || null, memberCount: (members ?? []).length, lastAt, unread,
              archivedAt: membership?.archived_at ?? null, pinnedAt: membership?.pinned_at ?? null,
              favoriteAt: membership?.favorite_at ?? null, lastReadAt,
            } satisfies ChatItem;
          }
          const peerId = otherIds[0];
          const peer = profiles?.find((profile) => profile.id === peerId);
          if (!peer) return null;
          return {
            id: conversation.id, type: "direct" as const, groupVersion: 1, peerId,
            name: peer.display_name || peer.username || "Kullanıcı", username: peer.username || "",
            avatarUrl: peer.avatar_url || null, memberCount: 2, lastAt, unread,
            archivedAt: membership?.archived_at ?? null, pinnedAt: membership?.pinned_at ?? null,
            favoriteAt: membership?.favorite_at ?? null, lastReadAt,
          } satisfies ChatItem;
        }));
        if (!active) return;
        setItems(results.filter((item): item is ChatItem => item !== null && !hiddenIds.has(item.id)).sort((a, b) => Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt)) || (b.lastAt || "").localeCompare(a.lastAt || "")));
      } catch (error) {
        if (!active) return;
        console.error("Chat list initial load failed:", error);
        setItems([]);
        setLoadError("Sohbetler yüklenemedi. Bağlantını kontrol edip sayfayı yenile.");
      } finally { if (active) setLoading(false); }
    }
    void loadChats();
    return () => { active = false; };
  }, [refreshKey, supabase, userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const channel = supabase.channel("chat-list:" + userId).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      if (!active) return;
      const message = payload.new as { conversation_id: string; sender_id: string; created_at: string };
      setItems((current) => current.map((item) => {
        if (item.id !== message.conversation_id) return item;
        const isUnread = message.sender_id !== userId
          && (!item.lastReadAt || new Date(message.created_at).getTime() > new Date(item.lastReadAt).getTime());
        return { ...item, lastAt: message.created_at, unread: isUnread ? item.unread + 1 : item.unread };
      }).sort((a, b) => Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt)) || (b.lastAt || "").localeCompare(a.lastAt || "")));
    }).on("postgres_changes", {
      event: "INSERT", schema: "public", table: "conversation_members", filter: `user_id=eq.${userId}`,
    }, () => {
      if (active) setRefreshKey((value) => value + 1);
    }).on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "conversation_members", filter: `user_id=eq.${userId}`,
    }, () => {
      if (active) setRefreshKey((value) => value + 1);
    }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [supabase, userId]);

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
    const { data, error } = await supabase.from("profiles").select("id, username, display_name, avatar_url, public_key").neq("id", user.id)
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
    const { error: restoreError } = await supabase.from("conversation_members")
      .update({ hidden_at: null }).eq("conversation_id", data).eq("user_id", user.id).is("left_at", null);
    if (restoreError) console.warn("Could not restore hidden conversation:", restoreError.message);
    setNewChatOpen(false); router.push(`/chat/${data}`);
  }

  async function createGroup() {
    if (!user || creatingGroup) return;
    const name = groupName.trim();
    if (name.length < 2 || name.length > 80) { setModalError("Grup adı 2-80 karakter olmalı."); return; }
    if (selectedMembers.length < 1) { setModalError("Grup için kendin hariç en az 1 kişi seç."); return; }
    setCreatingGroup(true); setModalError("");
    try {
      const { data: selectedProfiles, error: selectedError } = await supabase.from("profiles")
        .select("id, public_key").in("id", selectedMembers);
      if (selectedError || !selectedProfiles || selectedProfiles.length !== selectedMembers.length) {
        throw new Error("Seçilen üyelerin profilleri yüklenemedi.");
      }
      if (selectedProfiles.some((profile) => !profile.public_key)) {
        throw new Error("Seçilen üyelerden bazılarının E2EE açık anahtarı hazır değil. Önce bu üyelerle birebir sohbet başlatılmalı.");
      }
      const identity = await getOrCreateIdentity(user.id);
      const { error: publishError } = await supabase.from("profiles").update({ public_key: identity.publicKey }).eq("id", user.id);
      if (publishError) throw new Error("Kendi açık anahtarın kaydedilemedi: " + publishError.message);
      const { data: ownProfile, error: ownProfileError } = await supabase.from("profiles")
        .select("public_key").eq("id", user.id).single();
      if (ownProfileError || !ownProfile?.public_key) throw new Error("Kendi açık anahtarın okunamadı.");
      const conversationId = crypto.randomUUID();
      const generated = await createGroupKey();
      const recipients = [{ id: user.id, public_key: ownProfile.public_key }, ...selectedProfiles];
      const encryptedKeys = await Promise.all(recipients.map(async (recipient) => ({
        user_id: recipient.id,
        encrypted_group_key: await wrapGroupKey(generated.rawKeyHex, identity.privateKey, recipient.public_key!, conversationId),
      })));
      const memberIds = recipients.map((recipient) => recipient.id);
      const { data, error } = await supabase.rpc("create_group_conversation", {
        p_conversation_id: conversationId,
        p_name: name,
        p_avatar_url: groupAvatarUrl.trim() || null,
        p_member_ids: memberIds,
        p_encrypted_keys: encryptedKeys,
      });
      if (error || !data) throw new Error(error?.message || "Grup oluşturulamadı.");
      setNewChatOpen(false);
      setGroupMode(false); setGroupName(""); setGroupAvatarUrl(""); setSelectedMembers([]);
      router.push(`/chat/${data}`);
    } catch (groupError) {
      console.error("E2EE group creation failed:", groupError);
      setModalError(groupError instanceof Error ? groupError.message : "Grup oluşturulamadı.");
    } finally { setCreatingGroup(false); }
  }

  async function toggleConversationFlag(item: ChatItem, flag: "archived_at" | "pinned_at" | "favorite_at") {
    if (!userId) return;
    const currentValue = flag === "archived_at" ? item.archivedAt : flag === "pinned_at" ? item.pinnedAt : item.favoriteAt;
    const nextValue = currentValue ? null : new Date().toISOString();
    const update = flag === "archived_at" ? { archived_at: nextValue } : flag === "pinned_at" ? { pinned_at: nextValue } : { favorite_at: nextValue };
    const { error } = await supabase.from("conversation_members").update(update)
      .eq("conversation_id", item.id).eq("user_id", userId).is("left_at", null);
    if (error) { setLoadError(error.message); setMenuConversationId(null); return; }
    setItems((current) => current.map((entry) => entry.id !== item.id ? entry : {
      ...entry,
      archivedAt: flag === "archived_at" ? nextValue : entry.archivedAt,
      pinnedAt: flag === "pinned_at" ? nextValue : entry.pinnedAt,
      favoriteAt: flag === "favorite_at" ? nextValue : entry.favoriteAt,
    }).sort((a, b) => Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt)) || (b.lastAt || "").localeCompare(a.lastAt || "")));
    setMenuConversationId(null);
  }

  async function markUnread(item: ChatItem) {
    if (!userId) return;
    const unreadAt = new Date().toISOString();
    const { error } = await supabase.from("conversation_members").update({ unread_at: unreadAt })
      .eq("conversation_id", item.id).eq("user_id", userId).is("left_at", null);
    if (error) { setLoadError(error.message); setMenuConversationId(null); return; }
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, unread: Math.max(entry.unread, 1) } : entry));
    setMenuConversationId(null);
  }

  async function handleConversationAction(item: ChatItem) {
    if (!userId) return;
    const isGroup = item.type === "group";
    if (!window.confirm(isGroup ? "Gruptan ayrılmak istiyor musun?" : "Sohbeti kendi listenden silmek istiyor musun?")) return;
    setMenuConversationId(null);
    try {
      if (isGroup) {
        const { error } = await supabase.rpc("leave_group_conversation", { p_conversation_id: item.id });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("conversation_members")
          .update({ hidden_at: new Date().toISOString() })
          .eq("conversation_id", item.id).eq("user_id", userId).is("left_at", null)
          .select("conversation_id").maybeSingle();
        if (error || !data) throw error ?? new Error("Sohbet listeden kaldırılamadı.");
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (activeConversationId === item.id) router.push("/chat");
    } catch (actionError) {
      console.error("Conversation action failed:", actionError);
      setLoadError(actionError instanceof Error ? actionError.message : "Sohbet işlemi tamamlanamadı.");
    }
  }

  const filtered = items.filter((item) => {
    const matchesTerm = `${item.name} ${item.username}`.toLocaleLowerCase("tr-TR").includes(term.toLocaleLowerCase("tr-TR"));
    const matchesFilter = filter === "all" ? !item.archivedAt : filter === "archived" ? Boolean(item.archivedAt) : (filter === "unread" && item.unread > 0) || (filter === "favorites" && Boolean(item.favoriteAt)) || (filter === "groups" && item.type === "group");
    return matchesTerm && matchesFilter;
  });

  return (
    <div className={`chat-sidebar-layout flex h-full w-full min-w-0 shrink-0 ${activeConversationId ? "hidden md:flex" : "flex"}`}>
      <NavigationRail showMobileNav={!activeConversationId} />
      <aside className={`chat-sidebar flex h-full min-h-0 min-w-0 flex-col border-r border-slate-700/70 ${activeConversationId ? "hidden md:flex" : "flex"}`}>
        <header className="chat-list-heading flex h-[68px] shrink-0 items-center justify-between px-5">
          <h1 className="text-[19px] font-semibold text-slate-300">Sohbet</h1>
          <button type="button" onClick={() => { setNewChatOpen(true); setGroupMode(false); setPersonTerm(""); setPeople([]); setPeopleSearched(false); setModalError(""); setSelectedMembers([]); }} aria-label="Yeni sohbet" title="Yeni sohbet" className="chat-new-button"><MessageCirclePlus size={22} /></button>
        </header>
        <div className="chat-search-wrap shrink-0 px-5 pb-4">
          <label className="search-field chat-search-field"><Search size={19} className="shrink-0 text-slate-400" /><input id="chat-search-input" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Ara" aria-label="Kişi veya sohbet ara" /></label>
        </div>
        <div className="chat-filter-row flex shrink-0 items-center gap-2 overflow-x-auto px-5 pb-4" aria-label="Sohbet filtreleri">
          {([["all", "Tümü"], ["favorites", "Favoriler"], ["unread", "Okunmamış"], ["groups", "Gruplar"], ["archived", "Arşiv"]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`chat-filter-pill ${filter === key ? "chat-filter-pill-active" : ""}`}>{label}</button>)}
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Sohbet listesi">
          {loadError && <p role="alert" className="mx-4 mb-3 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">{loadError}</p>}
          {term.trim().length >= 2 && <section className="inline-people-results" aria-label="Kişi arama sonuçları">
            <p className="inline-people-heading">KİŞİLER {inlineSearchLoading ? "· aranıyor" : ""}</p>
            {inlinePeople.map((person) => <button key={person.id} type="button" onClick={() => void startConversation(person)} disabled={openingId !== null} className="new-chat-person">
              <span className="avatar-ring">{person.avatar_url ? <Image src={person.avatar_url} alt="" width={42} height={42} unoptimized className="h-full w-full rounded-full object-cover" /> : initials(person.display_name || person.username)}</span>
              <span className="min-w-0 flex-1 text-left"><strong>{person.display_name || person.username}</strong><small>@{person.username}</small></span>
              <span className="new-chat-action">Mesaj</span>
            </button>)}
            {!inlineSearchLoading && inlinePeople.length === 0 && <p className="inline-people-empty">Eşleşen kişi bulunamadı.</p>}
          </section>}
          {loading ? <div className="px-6 py-8 text-sm text-slate-400">Sohbetler yükleniyor...</div> : filtered.length ? filtered.map((item) => (
            <div key={item.id} className="group relative" onContextMenu={(event) => { event.preventDefault(); setMenuConversationId(item.id); }}>
            <Link href={`/chat/${item.id}`} onClick={() => markRead(item.id)} className={`chat-list-item pr-12 ${activeConversationId === item.id ? "chat-list-item-active" : ""}`}>
              <div className="avatar-ring avatar-ring-large chat-list-avatar">{item.avatarUrl ? <Image src={item.avatarUrl} alt="" width={52} height={52} unoptimized className="h-full w-full rounded-full object-cover" /> : <span>{initials(item.name)}</span>}</div>
              <div className="chat-list-copy min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate text-[16px] font-medium text-slate-100">{item.name}</p><time className={`shrink-0 text-[11px] ${item.unread ? "text-sky-400" : "text-slate-400"}`}>{timeLabel(item.lastAt)}</time></div>
                <div className="mt-1.5 flex items-center justify-between gap-2"><p className="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-slate-400"><CheckCheck size={14} className="shrink-0 text-slate-500" />{item.lastAt ? "Uçtan uca şifreli mesaj" : "Sohbet başladı"}</p>{item.unread > 0 && <span className="unread-badge">{item.unread > 99 ? "99+" : item.unread}</span>}</div>
              </div>
            </Link>
              <button type="button" aria-label="Sohbet seçenekleri" title="Sohbet seçenekleri"
                onClick={() => setMenuConversationId((current) => current === item.id ? null : item.id)}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-lg p-2 text-slate-400 opacity-70 transition hover:bg-slate-700 hover:text-white group-hover:opacity-100">
                <MoreVertical size={17} />
              </button>
              {menuConversationId === item.id && <div className="absolute right-3 top-[calc(100%-8px)] z-30 min-w-52 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-xl">
                <button type="button" onClick={() => void toggleConversationFlag(item, "pinned_at")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"><Pin size={14} />{item.pinnedAt ? "Sabitlemeyi kaldır" : "Sohbeti sabitle"}</button>
                <button type="button" onClick={() => void toggleConversationFlag(item, "favorite_at")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"><Star size={14} />{item.favoriteAt ? "Favorilerden çıkar" : "Favorilere ekle"}</button>
                <button type="button" onClick={() => void toggleConversationFlag(item, "archived_at")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"><Archive size={14} />{item.archivedAt ? "Arşivden çıkar" : "Arşivle"}</button>
                <button type="button" onClick={() => void markUnread(item)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"><Bell size={14} />Okunmadı olarak işaretle</button>
                <div className="my-1 border-t border-slate-700" />
                <button type="button" onClick={() => void handleConversationAction(item)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-rose-300 transition hover:bg-slate-800">
                  {item.type === "group" ? <LogOut size={15} /> : <Trash2 size={15} />}
                  {item.type === "group" ? "Gruptan Ayrıl" : "Sohbeti Sil"}
                </button>
              </div>}
            </div>
          )) : <div className="px-6 py-12 text-center"><MessageCircle size={30} className="mx-auto mb-3 text-slate-500" /><p className="text-sm text-slate-300">{filter === "favorites" ? "Henüz favori sohbetin yok." : filter === "groups" ? "Grup sohbeti bulunmuyor." : filter === "unread" ? "Okunmamış sohbet yok." : term ? "Eşleşen sohbet yok." : "Henüz sohbetin yok."}</p>{filter === "all" && <button type="button" onClick={() => setNewChatOpen(true)} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-sky-400 hover:text-sky-300"><Plus size={16} /> Yeni sohbet başlat</button>}</div>}
        </nav>
      </aside>

      {newChatOpen && <div className="new-chat-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewChatOpen(false); }}>
        <section className="new-chat-modal" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
          <header className="new-chat-modal-header"><div className="flex items-center gap-3"><button type="button" onClick={() => setNewChatOpen(false)} className="new-chat-close" aria-label="Kapat"><ArrowLeft size={20} /></button><h2 id="new-chat-title">Yeni sohbet</h2></div><div className="flex items-center gap-2"><button type="button" onClick={() => { setGroupMode((value) => !value); setModalError(""); }} className="new-chat-action">{groupMode ? "Birebir" : "Yeni Grup"}</button><button type="button" onClick={() => setNewChatOpen(false)} className="new-chat-close" aria-label="Kapat"><X size={19} /></button></div></header>
          {groupMode && <div className="space-y-2 px-5 pt-4"><input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={80} placeholder="Grup adı" aria-label="Grup adı" className="chat-message-input w-full rounded-xl px-4 py-3 text-sm" /><input value={groupAvatarUrl} onChange={(event) => setGroupAvatarUrl(event.target.value)} placeholder="Grup fotoğrafı URL (isteğe bağlı)" aria-label="Grup fotoğrafı URL" className="chat-message-input w-full rounded-xl px-4 py-3 text-sm" /><p className="text-xs text-slate-400">Gruba eklenecek kişileri aşağıdan seç. Kendin hariç en az 1 kişi.</p></div>}
          <form onSubmit={searchPeople} className="new-chat-search"><Search size={19} /><input autoFocus value={personTerm} onChange={(event) => setPersonTerm(event.target.value)} placeholder="İsim veya kullanıcı adı ara" aria-label="Kişi ara" /></form>
          <div className="new-chat-results">
            {!peopleSearched && <div className="new-chat-hint"><UserRound size={30} /><p>Yeni bir sohbet başlatmak için kişi ara.</p></div>}
            {people.map((person) => <button key={person.id} type="button" onClick={() => {
              if (groupMode) setSelectedMembers((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id]);
              else void startConversation(person);
            }} disabled={openingId !== null || creatingGroup} className="new-chat-person">
              <span className="avatar-ring">{person.avatar_url ? <Image src={person.avatar_url} alt="" width={42} height={42} unoptimized className="h-full w-full rounded-full object-cover" /> : initials(person.display_name || person.username)}</span>
              <span className="min-w-0 flex-1 text-left"><strong>{person.display_name || person.username}</strong><small>@{person.username}</small></span>
              <span className="new-chat-action">{groupMode ? selectedMembers.includes(person.id) ? "Seçildi" : "Ekle" : openingId === person.id ? "Açılıyor..." : "Mesaj"}</span>
            </button>)}
            {groupMode && <div className="px-2 py-3"><p className="mb-3 text-xs text-slate-300">Seçilen üye: {selectedMembers.length}</p><button type="button" onClick={() => void createGroup()} disabled={creatingGroup || selectedMembers.length < 1 || groupName.trim().length < 2} className="new-chat-action w-full">{creatingGroup ? "Grup oluşturuluyor..." : "Grup oluştur"}</button></div>}
            {modalError && <p role="status" className="new-chat-error">{modalError}</p>}
          </div>
        </section>
      </div>}
    </div>
  );
}
