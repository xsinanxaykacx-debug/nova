"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!isSupabaseConfigured()) {
      setError("Supabase bağlantısı yapılandırılmamış. apps/web/.env.local dosyasını kontrol et.");
      return;
    }
    setBusy(true);
    try {
      const origin = window.location.origin;
      const { data, error: signupError } = await createBrowserSupabaseClient().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=/profile`,
          data: { username: username.toLowerCase(), display_name: displayName.trim() },
        },
      });
      if (signupError) {
        setError(signupError.message);
        return;
      }
      if (data.session) {
        router.replace("/profile");
        router.refresh();
        return;
      }
      setNotice("Kayıt oluşturuldu. E-posta adresine gönderilen doğrulama bağlantısına tıkla, ardından giriş yap.");
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Kayıt sırasında bir hata oluştu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-sky-950/20">
        <Link href="/" className="text-sm font-semibold text-sky-300">← NOVA CHAT</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">NOVA topluluğuna katıl</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Hesap oluştur</h1>
        <p className="mt-2 text-sm text-slate-400">Birkaç bilgiyle hesabını aç.</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm text-slate-300">Görünen ad
            <input required maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400" />
          </label>
          <label className="block text-sm text-slate-300">Kullanıcı adı
            <input required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400" />
            <span className="mt-1 block text-xs text-slate-500">3–24 karakter; harf, rakam ve alt çizgi.</span>
          </label>
          <label className="block text-sm text-slate-300">E-posta
            <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400" />
          </label>
          <label className="block text-sm text-slate-300">Şifre
            <input required minLength={6} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400" />
          </label>
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-sky-500 px-5 py-3.5 font-semibold text-white transition hover:bg-sky-400 disabled:opacity-60">{busy ? "Hesap oluşturuluyor..." : "Kayıt Ol"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">Zaten hesabın var mı? <Link className="font-semibold text-sky-300 hover:text-sky-200" href="/login">Giriş yap</Link></p>
      </section>
    </main>
  );
}
