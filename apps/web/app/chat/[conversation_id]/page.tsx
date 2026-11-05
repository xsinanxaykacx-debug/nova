import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ChatPageProps = { params: { conversation_id: string } };

export default async function ChatPage({ params }: ChatPageProps) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", params.conversation_id)
    .maybeSingle();
  if (!conversation) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">NOVA CHAT</p>
        <h1 className="mt-4 text-3xl font-semibold text-white">Sohbet başlatıldı</h1>
        <p className="mt-3 text-sm text-slate-400">Güvenli mesajlaşma altyapısı hazırlanıyor.</p>
        <Link href="/search" className="mt-8 inline-flex rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 hover:border-violet-400/60">Kullanıcı ara</Link>
      </section>
    </main>
  );
}
