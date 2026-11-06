"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, Plus, Trash2, Check } from "lucide-react";
import { NavigationRail } from "@/components/navigation-rail";
import { useAuth } from "@/components/auth-provider";

type CallRecord = {
  id: string;
  name: string;
  direction: "incoming" | "outgoing" | "missed";
  kind: "voice" | "video";
  createdAt: string;
  note: string;
};

export default function CallsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const filteredCalls = useMemo(() => calls.filter((call) => call.name.toLocaleLowerCase("tr-TR").includes(term.toLocaleLowerCase("tr-TR"))), [calls, term]);
  const selectedCall = calls.find((call) => call.id === selectedIds[0]) ?? null;

  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  if (loading || !user) return <main className="flex h-[100dvh] items-center justify-center bg-[#0f172a] text-sm text-slate-400">Oturum kontrol ediliyor...</main>;

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  return (
    <main className="chat-app-shell flex h-[100dvh] min-h-[560px] overflow-hidden text-slate-100">
      <div className="chat-sidebar-layout flex h-full w-full min-w-0 shrink-0">
        <NavigationRail />
        <aside className="calls-sidebar flex h-full min-h-0 min-w-0 flex-1 flex-col border-r border-slate-700/70 md:flex-none">
          <header className="calls-heading flex h-[68px] shrink-0 items-center justify-between px-5">
            <h1 className="text-[19px] font-semibold text-slate-300">Aramalar</h1>
            <button type="button" onClick={() => router.push("/search")} aria-label="Yeni arama" title="Yeni arama" className="call-heading-action"><span className="relative inline-flex"><PhoneCall size={20} /><Plus size={11} className="absolute -right-1 -top-1 rounded-full bg-[#111a2d]" /></span></button>
            <button type="button" disabled={selectedIds.length === 0} onClick={() => { setCalls((current) => current.filter((call) => !selectedIds.includes(call.id))); setSelectedIds([]); }} aria-label="Seçilen aramaları temizle" title="Seçilenleri sil" className="call-heading-action disabled:opacity-30"><Trash2 size={20} /></button>
          </header>
          <div className="chat-search-wrap shrink-0 px-5 pb-4">
            <label className="search-field chat-search-field"><span className="text-slate-400"><Phone size={17} /></span><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Ara" aria-label="Aramalarda ara" /></label>
          </div>
          <section className="min-h-0 flex-1 overflow-y-auto border-t border-slate-700/50 px-2 py-3">
            {filteredCalls.length ? filteredCalls.map((call) => (
              <div key={call.id} className={`call-history-row ${selectedIds.includes(call.id) ? "call-history-row-selected" : ""}`}>
                <button type="button" onClick={() => toggleSelected(call.id)} aria-label={selectedIds.includes(call.id) ? "Seçimi kaldır" : "Aramayı seç"} className="call-select"><span>{selectedIds.includes(call.id) ? <Check size={14} /> : null}</span></button>
                <button type="button" onClick={() => setSelectedIds([call.id])} className="call-person min-w-0 flex-1 text-left">
                  <span className="call-avatar">{call.direction === "outgoing" ? <PhoneOutgoing size={18} /> : <PhoneIncoming size={18} />}</span>
                  <span className="min-w-0 flex-1"><strong>{call.name}</strong><small>{call.direction === "incoming" ? "Gelen" : call.direction === "outgoing" ? "Giden" : "Cevapsız"} {call.kind === "voice" ? "sesli arama" : "görüntülü arama"}</small></span>
                  <time>{new Date(call.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time>
                </button>
              </div>
            )) : <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-5 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400"><Phone size={22} /></span>
              <p className="text-sm font-medium text-slate-300">{term ? "Eşleşen arama yok" : "Henüz arama yok"}</p>
            </div>}
          </section>
        </aside>
      </div>
      <section className="calls-detail-panel hidden min-w-0 flex-1 items-center justify-center px-8 md:flex">
        {selectedCall ? <div className="w-full max-w-md rounded-2xl p-7">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/50 text-slate-700"><Phone size={26} /></div>
          <h2 className="text-center text-xl font-semibold text-slate-900">{selectedCall.name}</h2>
          <div className="mt-7 space-y-4 text-sm text-slate-700">
            <p>{selectedCall.direction === "incoming" ? "Gelen" : selectedCall.direction === "outgoing" ? "Giden" : "Cevapsız"} {selectedCall.kind === "voice" ? "sesli arama" : "görüntülü arama"}</p>
            <p>{new Date(selectedCall.createdAt).toLocaleString("tr-TR")}</p>
            <p>{selectedCall.note}</p>
          </div>
        </div> : <div className="text-sm text-slate-500">Bir arama seç</div>}
      </section>
    </main>
  );
}
