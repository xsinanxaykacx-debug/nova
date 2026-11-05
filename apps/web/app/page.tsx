import Link from "next/link";
import { ArrowRight, LockKeyhole, MessageCircle, Search, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07111f] px-5 py-16 text-center sm:px-8">
    <div className="pointer-events-none absolute left-1/2 top-1/4 h-80 w-80 -translate-x-1/2 rounded-full bg-sky-500/10 blur-[120px]" />
    <section className="relative z-10 mx-auto w-full max-w-3xl">
      <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-400/25 bg-sky-400/10 text-sky-300 shadow-glow"><MessageCircle size={31} /></div>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-sky-400">Connect. Chat. Share.</p>
      <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-7xl">NOVA <span className="text-sky-400">CHAT</span></h1>
      <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">Güvenli, sade ve uçtan uca şifreli mesajlaşma alanın.</p>
      <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/chat" className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-8 py-3.5 text-sm font-semibold text-slate-950 shadow-glow transition hover:bg-sky-400">Sohbetlere git <ArrowRight size={16} /></Link>
        <Link href="/login" className="rounded-xl border border-slate-700 bg-slate-900/70 px-8 py-3.5 text-sm font-semibold text-slate-200 transition hover:border-sky-400/60 hover:bg-slate-800">Giriş yap</Link>
        <Link href="/signup" className="rounded-xl border border-slate-700 px-8 py-3.5 text-sm font-semibold text-slate-300 transition hover:border-sky-400/60">Kayıt ol</Link>
      </div>
      <div className="mt-12 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2"><LockKeyhole size={14} className="text-sky-400" /> AES-256-GCM şifreleme</span>
        <span className="inline-flex items-center gap-2"><ShieldCheck size={14} className="text-sky-400" /> Özel anahtar cihazında</span>
        <Link href="/search" className="inline-flex items-center gap-2 transition hover:text-sky-300"><Search size={14} /> Kullanıcı ara</Link>
      </div>
    </section>
  </main>;
}
