"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Search, Star, PhoneCall, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { NavigationRail } from "@/components/navigation-rail";
import { useAuth } from "@/components/auth-provider";

export default function CallsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [term, setTerm] = useState("");
  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  if (loading || !user) return <main className="flex h-[100dvh] items-center justify-center bg-[#0f172a] text-sm text-slate-400">Oturum kontrol ediliyor...</main>;

  return (
    <main className="chat-app-shell flex h-[100dvh] min-h-[560px] overflow-hidden text-slate-100">
      <div className="chat-sidebar-layout flex h-full w-full min-w-0 shrink-0">
        <NavigationRail />
        <aside className="calls-sidebar flex h-full min-h-0 min-w-0 flex-1 flex-col border-r border-slate-700/70 md:flex-none">
          <header className="chat-list-heading flex h-[76px] shrink-0 items-center px-6"><h1 className="text-[22px] font-semibold tracking-tight text-slate-100">Aramalar</h1></header>
          <div className="chat-search-wrap shrink-0 px-5 pb-5">
            <label className="search-field chat-search-field"><Search size={19} className="shrink-0 text-slate-400" /><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Ara" aria-label="Aramalarda ara" /></label>
          </div>
          <section className="px-5 pb-6">
            <h2 className="mb-4 text-[15px] font-semibold text-slate-100">Favoriler</h2>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-700/60 bg-slate-800/40 px-4 py-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700/70 text-slate-300"><Star size={19} /></span>
              <div><p className="text-sm font-medium text-slate-200">Favori kişi ekle</p><p className="mt-1 text-xs text-slate-400">Sık aradığın kişilere hızlıca ulaş</p></div>
            </div>
          </section>
          <section className="min-h-0 flex-1 border-t border-slate-700/50 px-5 py-5">
            <h2 className="mb-5 text-[15px] font-semibold text-slate-100">En son</h2>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-slate-400"><PhoneCall size={27} strokeWidth={1.5} /></span>
              <p className="text-sm font-medium text-slate-300">{term ? "Eşleşen arama bulunamadı" : "Henüz arama yok"}</p>
              <p className="mt-2 max-w-[250px] text-xs leading-5 text-slate-500">Yaptığın ve aldığın aramalar burada görünecek.</p>
            </div>
          </section>
        </aside>
      </div>
      <section className="hidden min-w-0 flex-1 flex-col items-center justify-center border-b-[6px] border-sky-400 bg-[#0f172a] px-8 text-center md:flex">
        <div className="mb-7 flex h-36 w-36 items-center justify-center rounded-full border border-sky-400/20 bg-sky-400/[0.07] text-sky-400"><Phone size={68} strokeWidth={1.15} /></div>
        <h2 className="text-[28px] font-light tracking-tight text-slate-100">Aramalar</h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-slate-400">Arama geçmişin ve favori kişilerin burada görünecek.</p>
        <div className="mt-8 flex items-center gap-5 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><PhoneOutgoing size={14} /> Giden</span><span className="inline-flex items-center gap-2"><PhoneIncoming size={14} /> Gelen</span></div>
      </section>
    </main>
  );
}
