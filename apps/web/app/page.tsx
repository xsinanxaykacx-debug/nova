"use client";

import Link from "next/link";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <main className="nova-hero flex min-h-screen items-center justify-center px-5 py-16 text-center sm:px-8">
      <section className="mx-auto w-full max-w-3xl">
        <p className="nova-hero-title">NOVA</p>
        <p className="nova-hero-connector">ile</p>
        <p className="nova-hero-tagline">Muhabbet et sevdiklerinle</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/chat" className="nova-primary-button inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-sm font-semibold transition">
            Sohbetlere git <ArrowRight size={16} />
          </Link>
          <Link href="/login" className="nova-secondary-button rounded-xl px-8 py-3.5 text-sm font-semibold transition">
            Giriş yap
          </Link>
          <Link href="/signup" className="nova-secondary-button rounded-xl px-8 py-3.5 text-sm font-semibold transition">
            Kayıt ol
          </Link>
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm text-slate-300">
          <span className="inline-flex items-center gap-2"><LockKeyhole size={15} className="text-sky-400" /> AES-256-GCM şifreleme</span>
          <span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-sky-400" /> Özel anahtar cihazında</span>
          <span className="text-slate-400">Yeni sohbet başlatmak için + simgesini kullan</span>
        </div>
      </section>
    </main>
  );
}
