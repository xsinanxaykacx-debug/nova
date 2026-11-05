"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, MessageCircle, Phone, Search, User, UserRound } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function NavigationRail({ showMobileNav = true }: { showMobileNav?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const chatActive = pathname.startsWith("/chat");
  const callsActive = pathname.startsWith("/calls");
  const searchActive = pathname.startsWith("/search");
  const profileActive = pathname.startsWith("/profile");

  async function signOut() {
    const { error } = await createBrowserSupabaseClient().auth.signOut();
    if (error) {
      console.error("Unable to sign out:", error.message);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <nav className="navigation-rail hidden h-full w-[68px] shrink-0 flex-col items-center border-r border-slate-800/90 py-4 md:flex" aria-label="Ana navigasyon">
        <Link href="/chat" aria-label="NOVA sohbetler" title="NOVA" className="mb-7 flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sm font-bold tracking-tight text-sky-300">N</Link>
        <div className="flex flex-col items-center gap-3">
          <Link href="/chat" aria-label="Sohbetler" title="Sohbetler" data-tooltip="Sohbetler" aria-current={chatActive ? "page" : undefined} className={`rail-link ${chatActive ? "rail-link-active" : ""}`}><MessageCircle size={21} /></Link>
          <Link href="/calls" aria-label="Aramalar" title="Aramalar" data-tooltip="Aramalar" aria-current={callsActive ? "page" : undefined} className={`rail-link ${callsActive ? "rail-link-active" : ""}`}><Phone size={21} /></Link>
          <Link href="/search" aria-label="Kişi ara" title="Kişi ara" data-tooltip="Kişi ara" aria-current={searchActive ? "page" : undefined} className={`rail-link ${searchActive ? "rail-link-active" : ""}`}><Search size={21} /></Link>
          <Link href="/profile" aria-label="Profil" title="Profil" data-tooltip="Profil" aria-current={profileActive ? "page" : undefined} className={`rail-link ${profileActive ? "rail-link-active" : ""}`}><User size={21} /></Link>
        </div>
        <div className="mt-auto flex flex-col items-center gap-3">
          <button type="button" onClick={() => void signOut()} aria-label="Çıkış yap" title="Çıkış yap" data-tooltip="Çıkış yap" className="rail-link rail-link-logout"><LogOut size={21} /></button>
        </div>
      </nav>
      {showMobileNav && <div className="mobile-bottom-nav grid grid-cols-4 border-t border-slate-800/80 px-3 py-2 md:hidden">
        <Link href="/chat" className={`mobile-nav-link ${chatActive ? "mobile-nav-active" : ""}`}><MessageCircle size={19} />Sohbet</Link>
        <Link href="/calls" className={`mobile-nav-link ${callsActive ? "mobile-nav-active" : ""}`}><Phone size={19} />Aramalar</Link>
        <Link href="/search" className={`mobile-nav-link ${searchActive ? "mobile-nav-active" : ""}`}><Search size={19} />Ara</Link>
        <Link href="/profile" className={`mobile-nav-link ${profileActive ? "mobile-nav-active" : ""}`}><UserRound size={19} />Profil</Link>
      </div>}
    </>
  );
}
