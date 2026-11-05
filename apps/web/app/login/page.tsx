"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!isSupabaseConfigured()) {
      setError("Supabase bağlantısı yapılandırılmamış. apps/web/.env.local dosyasını kontrol et.");
      return;
    }
    setBusy(true);
    const { error: signInError } = await createBrowserSupabaseClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace(searchParams.get("next") || "/profile");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-violet-950/20">
        <Link href="/" className="text-sm font-semibold text-violet-300">← NOVA CHAT</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Tekrar hoş geldin</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Giriş yap</h1>
        <p className="mt-2 text-sm text-slate-400">Hesabına e-posta adresinle eriş.</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm text-slate-300">E-posta
            <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-violet-400" />
          </label>
          <label className="block text-sm text-slate-300">Şifre
            <input required minLength={6} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-violet-400" />
          </label>
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-violet-500 px-5 py-3.5 font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60">{busy ? "Giriş yapılıyor..." : "Giriş Yap"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">Hesabın yok mu? <Link className="font-semibold text-violet-300 hover:text-violet-200" href="/signup">Kayıt ol</Link></p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="min-h-screen" />}><LoginForm /></Suspense>;
}
