"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, MessageCircle, Search } from "lucide-react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { useAuth } from "@/components/auth-provider";

export default function ChatInboxPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  if (loading || !user) return <main className="flex h-[100dvh] items-center justify-center bg-[#07111f] text-sm text-slate-500">Oturum kontrol ediliyor...</main>;

  return <main className="chat-app-shell flex h-[100dvh] min-h-[560px] overflow-hidden text-slate-100">
    <ChatSidebar />
    <section className="chat-empty-state hidden min-w-0 flex-1 flex-col items-center justify-center px-8 text-center md:flex">
      <div className="chat-empty-illustration mb-8 flex h-40 w-40 items-center justify-center rounded-full">
        <MessageCircle size={82} strokeWidth={1.15} />
      </div>
      <h1 className="text-[30px] font-light tracking-tight text-slate-100">Sohbet etmeye başlayın</h1>
      <p className="mt-3 max-w-md text-[14px] leading-7 text-slate-400">Sohbet etmeye başlamak için bir kişi seçin</p>
      <div className="mt-10 flex items-center gap-2 text-xs text-slate-500"><LockKeyhole size={14} /> Uçtan uca şifreli iletişim</div>
    </section>
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center md:hidden">
      <MessageCircle size={42} className="mb-5 text-sky-400" />
      <p className="text-sm text-slate-300">Sohbet etmeye başlamak için bir kişi seçin</p>
      <Link href="/search" className="mt-5 inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950"><Search size={16} /> Kişi bul</Link>
    </div>
  </main>;
}
