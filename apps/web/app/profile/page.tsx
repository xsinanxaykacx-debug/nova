"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Profile = { username: string; display_name: string; avatar_url: string | null };

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<Profile>({ username: "", display_name: "", avatar_url: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    createBrowserSupabaseClient()
      .from("profiles")
      .select("username, display_name, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else if (data) setProfile(data);
      });
    return () => { active = false; };
  }, [user]);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setMessage("");
    setError("");
    const { error: updateError } = await createBrowserSupabaseClient()
      .from("profiles")
      .update({ username: profile.username.toLowerCase(), display_name: profile.display_name.trim() })
      .eq("id", user.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.code === "23505" ? "Bu kullanıcı adı zaten kullanılıyor." : updateError.message);
      return;
    }
    setMessage("Profilin güncellendi.");
  }

  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (loading || (!user && typeof window !== "undefined")) {
    return <main className="flex min-h-screen items-center justify-center text-slate-400">Oturum kontrol ediliyor...</main>;
  }

  return (
    <main className="min-h-screen px-5 py-12">
      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">NOVA CHAT</p><h1 className="mt-2 text-3xl font-semibold text-white">Profilin</h1><p className="mt-2 text-sm text-slate-400">{user?.email}</p></div>
          <button onClick={signOut} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-rose-400/60 hover:text-rose-300">Çıkış Yap</button>
        </div>
        <form onSubmit={updateProfile} className="mt-10 space-y-5">
          <label className="block text-sm text-slate-300">Kullanıcı adı
            <input required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={profile.username} onChange={(event) => setProfile((current) => ({ ...current, username: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-violet-400" />
          </label>
          <label className="block text-sm text-slate-300">Görünen ad
            <input required maxLength={60} value={profile.display_name} onChange={(event) => setProfile((current) => ({ ...current, display_name: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-violet-400" />
          </label>
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
          {message && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</p>}
          <button disabled={busy} className="rounded-xl bg-violet-500 px-6 py-3 font-semibold text-white hover:bg-violet-400 disabled:opacity-60">{busy ? "Kaydediliyor..." : "Profili Kaydet"}</button>
        </form>
      </section>
    </main>
  );
}
