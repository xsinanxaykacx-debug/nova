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

  return <main className="chat-app-shell flex h-[100dvh] min-h-[560px] overflow-hidden bg-[#07111f] text-slate-100">
    <ChatSidebar />
    <section className="hidden min-w-0 flex-1 flex-col items-center justify-center bg-[#0a1626] px-8 text-center md:flex">
      <div className="mb-7 flex h-24 w-24 items-center justify-center rounded-[28px] border border-sky-400/20 bg-sky-400/10 text-sky-300 shadow-[0_0_80px_rgba(56,189,248,0.08)]"><MessageCircle size={42} strokeWidth={1.4} /></div>
      <h1 className="text-3xl font-light tracking-wide text-slate-100">NOVA <span className="font-semibold text-sky-400">CHAT</span></h1>
      <p className="mt-4 max-w-md text-sm leading-7 text-slate-500">Mesajlaşmaya başlamak için soldan bir sohbet seç veya yeni bir konuşma oluştur.</p>
      <Link href="/search" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"><Search size={17} /> Kişi bul ve sohbet başlat</Link>
      <p className="mt-10 flex items-center gap-2 text-xs text-slate-600"><LockKeyhole size={13} /> Uçtan uca şifreli · AES-256-GCM</p>
    </section>
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center md:hidden">
      <MessageCircle size={36} className="mb-4 text-sky-400" /><p className="text-sm text-slate-400">Bir sohbet seç veya yeni sohbet başlat.</p>
      <Link href="/search" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950"><Search size={16} /> Kişi bul</Link>
    </div>
  </main>;
}
