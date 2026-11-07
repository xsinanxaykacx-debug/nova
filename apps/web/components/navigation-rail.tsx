"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, MessageCircle, Phone, X, Pencil, Check, ArrowLeft, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { PushNotificationButton } from "@/components/push-notification-button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Profile = { username: string; display_name: string; avatar_url: string | null };

function initials(value: string) {
  return value.trim().split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "N";
}

export function NavigationRail({ showMobileNav = true }: { showMobileNav?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<Profile>({ username: "", display_name: "", avatar_url: null });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const chatActive = pathname.startsWith("/chat");
  const callsActive = pathname.startsWith("/calls");

  useEffect(() => {
    if (!user) return;
    let active = true;
    void createBrowserSupabaseClient().from("profiles").select("username, display_name, avatar_url").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (active && data) setProfile(data);
    });
    return () => { active = false; };
  }, [user]);


  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setBusy(true); setError(""); setNotice("");
    const { error: updateError } = await createBrowserSupabaseClient().from("profiles")
      .update({ username: profile.username.trim().toLowerCase(), display_name: profile.display_name.trim() }).eq("id", user.id);
    setBusy(false);
    if (updateError) { setError(updateError.code === "23505" ? "Bu kullanıcı adı zaten kullanılıyor." : updateError.message); return; }
    setEditing(false); setNotice("Profilin güncellendi.");
  }

  async function signOut() {
    const { error: signOutError } = await createBrowserSupabaseClient().auth.signOut();
    if (signOutError) { setError("Çıkış yapılamadı. Tekrar dene."); return; }
    router.replace("/login"); router.refresh();
  }

  const displayName = profile.display_name || profile.username || "NABER kullanıcısı";
  const avatar = profile.avatar_url ? <Image src={profile.avatar_url} alt="" width={42} height={42} unoptimized className="h-full w-full rounded-full object-cover" /> : <span>{initials(displayName)}</span>;

  return (
    <>
      <nav className="navigation-rail hidden h-full w-[68px] shrink-0 flex-col items-center border-r border-slate-800/90 py-5 md:flex" aria-label="Ana navigasyon">
        <div className="flex flex-col items-center gap-4">
          <Link href="/chat" aria-label="Sohbet" title="Sohbet" data-tooltip="Sohbet" aria-current={chatActive ? "page" : undefined} className={`rail-link ${chatActive ? "rail-link-active" : ""}`}><MessageCircle size={21} /></Link>
          <Link href="/calls" aria-label="Aramalar" title="Aramalar" data-tooltip="Aramalar" aria-current={callsActive ? "page" : undefined} className={`rail-link ${callsActive ? "rail-link-active" : ""}`}><Phone size={21} /></Link>
          <PushNotificationButton />
        </div>
        <button type="button" onClick={() => { setProfileOpen(true); setEditing(false); setError(""); setNotice(""); }} aria-label="Profil" title="Profil" data-tooltip="Profil" className="rail-link mt-auto"><UserRound size={21} /></button>
      </nav>
      {showMobileNav && <div className="mobile-bottom-nav grid grid-cols-4 border-t border-slate-800/80 px-3 py-2 md:hidden">
        <Link href="/chat" className={`mobile-nav-link ${chatActive ? "mobile-nav-active" : ""}`}><MessageCircle size={19} />Sohbet</Link>
        <Link href="/calls" className={`mobile-nav-link ${callsActive ? "mobile-nav-active" : ""}`}><Phone size={19} />Aramalar</Link>
        <PushNotificationButton mobile />
        <button type="button" onClick={() => { setProfileOpen(true); setEditing(false); setError(""); setNotice(""); }} aria-label="Profil" className={`mobile-nav-link ${profileOpen ? "mobile-nav-active" : ""}`}><UserRound size={19} />Profil</button>
      </div>}

      {profileOpen && <div className="profile-panel-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
        <aside className="profile-side-panel" role="dialog" aria-modal="true" aria-label="Profil bilgileri">
          <header className="profile-panel-header">
            <button type="button" onClick={() => setProfileOpen(false)} className="profile-panel-back" aria-label="Kapat"><ArrowLeft size={20} /></button>
            <h2>Profil</h2>
            <button type="button" onClick={() => { setEditing((value) => !value); setError(""); setNotice(""); }} className="profile-panel-edit" aria-label={editing ? "Düzenlemeyi kapat" : "Profili düzenle"}>{editing ? <X size={19} /> : <Pencil size={18} />}</button>
          </header>
          <div className="profile-panel-content">
            <div className="profile-panel-identity">
              <div className="profile-panel-avatar">{avatar}</div>
              <h3>{displayName}</h3>
              <p>@{profile.username || "kullanıcı"}</p>
            </div>
            {editing ? <form onSubmit={saveProfile} className="profile-panel-fields">
              <label>Kullanıcı adı<input required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={profile.username} onChange={(event) => setProfile((current) => ({ ...current, username: event.target.value }))} /></label>
              <label>Görünen ad<input required maxLength={60} value={profile.display_name} onChange={(event) => setProfile((current) => ({ ...current, display_name: event.target.value }))} /></label>
              {error && <p role="alert" className="profile-panel-error">{error}</p>}
              <button type="submit" disabled={busy} className="profile-panel-save"><Check size={17} />{busy ? "Kaydediliyor..." : "Değişiklikleri kaydet"}</button>
            </form> : <div className="profile-panel-details">
              <div className="profile-detail-row"><span>Kullanıcı adı</span><strong>@{profile.username || "—"}</strong></div>
              <div className="profile-detail-row"><span>Görünen ad</span><strong>{profile.display_name || "—"}</strong></div>
              <div className="profile-detail-row"><span>E-posta</span><strong>{user?.email || "—"}</strong></div>
              {notice && <p role="status" className="profile-panel-notice">{notice}</p>}
              <button type="button" onClick={() => setEditing(true)} className="profile-panel-edit-text">Profili Düzenle</button>
            </div>}
            <button type="button" onClick={() => void signOut()} className="profile-panel-logout">Çıkış Yap</button>
          </div>
        </aside>
      </div>}
    </>
  );
}
