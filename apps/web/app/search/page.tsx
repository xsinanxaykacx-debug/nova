"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type SearchProfile = { id: string; username: string; display_name: string };

export default function SearchPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  async function searchUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setError("Arama yapmak için önce giriş yap.");
      return;
    }

    const safeTerm = term.trim().replace(/[^a-zA-Z0-9_ğüşöçıİĞÜŞÖÇ .-]/g, "").replace(/\s+/g, " ");
    if (safeTerm.length < 2) {
      setError("Arama için en az 2 karakter gir.");
      setResults([]);
      return;
    }

    setLoading(true);
    setError("");
    setSearched(true);
    const { data, error: searchError } = await createBrowserSupabaseClient()
      .from("profiles")
      .select("id, username, display_name")
      .neq("id", user.id)
      .or(`username.ilike.%${safeTerm}%,display_name.ilike.%${safeTerm}%`)
      .order("username", { ascending: true })
      .limit(30);
    setLoading(false);

    if (searchError) {
      setError("Kullanıcılar aranırken bir hata oluştu. Tekrar dene.");
      setResults([]);
      return;
    }
    setResults(data ?? []);
    if (!data?.length) setError("Bu aramayla eşleşen kullanıcı bulunamadı.");
  }

  async function startConversation(profile: SearchProfile) {
    if (!user) {
      setError("Sohbet başlatmak için önce giriş yap.");
      return;
    }
    setOpeningId(profile.id);
    setError("");
    const { data, error: createError } = await createBrowserSupabaseClient().rpc(
      "create_direct_conversation",
      { target_user_id: profile.id },
    );
    setOpeningId(null);
    if (createError || !data) {
      setError("Sohbet oluşturulamadı. Biraz sonra tekrar dene.");
      return;
    }
    router.push(`/chat/${data}`);
  }

  return (
    <main className="min-h-screen px-5 py-10 sm:px-8">
      <section className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-semibold text-violet-300">← NOVA CHAT</Link>
          <Link href="/profile" className="text-sm text-slate-400 hover:text-white">Profilim</Link>
        </div>
        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Kişiler</p>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Kullanıcı ara</h1>
          <p className="mt-3 text-sm text-slate-400">Kullanıcı adı veya görünen ad ile NOVA kullanıcılarını bul.</p>
        </div>
        <form onSubmit={searchUsers} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Örn. kullanici_adi" aria-label="Kullanıcı ara" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-violet-400" />
          <button type="submit" disabled={loading} className="rounded-xl bg-violet-500 px-6 py-3 font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60">{loading ? "Aranıyor..." : "Ara"}</button>
        </form>
        {error && <p role="status" className="mt-5 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">{error}</p>}
        <div className="mt-6 space-y-3">
          {results.map((profile) => (
            <article key={profile.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{profile.display_name || profile.username}</p>
                <p className="mt-1 truncate text-sm text-slate-400">@{profile.username}</p>
              </div>
              <button type="button" onClick={() => startConversation(profile)} disabled={openingId !== null} className="shrink-0 rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-50">
                {openingId === profile.id ? "Açılıyor..." : "Mesaj Gönder"}
              </button>
            </article>
          ))}
          {searched && !loading && results.length === 0 && !error && <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-400">Sonuç bulunamadı.</p>}
        </div>
      </section>
    </main>
  );
}
