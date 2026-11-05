"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const items = [
  { href: "/", label: "Sohbetler", icon: "◉" },
  { href: "/search", label: "Kullanıcı Ara", icon: "◎" },
  { href: "/profile", label: "Profil", icon: "○" },
];

export function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (["/login", "/signup", "/auth/callback"].some((path) => pathname.startsWith(path))) return null;

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    const { error } = await createBrowserSupabaseClient().auth.signOut();
    setSigningOut(false);
    if (error) return;
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-800 bg-slate-950/95 px-5 py-7 backdrop-blur md:flex">
        <Link href="/" className="mb-10 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/15 text-xl font-bold text-violet-200">N</span>
          <span><span className="block text-lg font-bold tracking-wide text-white">NOVA</span><span className="block text-[10px] uppercase tracking-[0.25em] text-slate-500">Connect. Chat. Share.</span></span>
        </Link>
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-600">MENÜ</p>
        <nav aria-label="Ana gezinme" className="space-y-2">
          {items.map((item) => {
            const active = item.href === "/" ? pathname === "/" || pathname.startsWith("/chat/") : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${active ? "border border-violet-400/20 bg-violet-500/10 text-violet-200" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}><span className="w-5 text-center text-base" aria-hidden="true">{item.icon}</span>{item.label}</Link>;
          })}
        </nav>
        <div className="mt-auto border-t border-slate-800 pt-5">
          {user ? <button type="button" onClick={signOut} disabled={signingOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"><span className="w-5 text-center" aria-hidden="true">↪</span>{signingOut ? "Çıkış yapılıyor..." : "Çıkış Yap"}</button> : <Link href="/login" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-violet-300 hover:bg-violet-500/10"><span className="w-5 text-center" aria-hidden="true">↪</span>{loading ? "Oturum kontrolü..." : "Giriş Yap"}</Link>}
        </div>
      </aside>
      <nav aria-label="Mobil gezinme" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-slate-800 bg-slate-950/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" || pathname.startsWith("/chat/") : pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-medium ${active ? "text-violet-300" : "text-slate-500"}`}><span className="text-lg leading-none" aria-hidden="true">{item.icon}</span>{item.label}</Link>;
        })}
        {user ? <button type="button" onClick={signOut} disabled={signingOut} className="flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-medium text-slate-500 hover:text-rose-300 disabled:opacity-50"><span className="text-lg leading-none" aria-hidden="true">↪</span>{signingOut ? "Çıkılıyor" : "Çıkış Yap"}</button> : <Link href="/login" className="flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-medium text-slate-500"><span className="text-lg leading-none" aria-hidden="true">↪</span>Giriş Yap</Link>}
      </nav>
    </>
  );
}
