import Link from "next/link";

const navigation = ["Sohbet", "Topluluk", "Kanallar", "Profil"];

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 pb-24 pt-12 sm:px-8 sm:pb-12">
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-600/20 blur-[110px]" />
      <section className="relative z-10 mx-auto w-full max-w-4xl text-center">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-500/15 text-3xl font-bold text-violet-200 shadow-glow">N</div>
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Connect. Chat. Share.</p>
        <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-7xl">NOVA <span className="text-violet-400">CHAT</span></h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">Sohbetlerin, toplulukların ve kanalların tek bir yerde buluştuğu yeni nesil iletişim alanı.</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/login" className="rounded-xl bg-violet-500 px-8 py-3.5 text-sm font-semibold text-white shadow-glow transition hover:bg-violet-400">Giriş Yap</Link>
          <Link href="/signup" className="rounded-xl border border-slate-700 bg-slate-900/70 px-8 py-3.5 text-sm font-semibold text-slate-200 transition hover:border-violet-400/60 hover:bg-slate-800">Kayıt Ol</Link>
          <Link href="/profile" className="rounded-xl border border-slate-700 px-8 py-3.5 text-sm font-semibold text-slate-300 hover:border-violet-400/60">Profilim</Link>
        </div>
        <p className="mt-8 text-xs text-slate-600">MVP-02 · Supabase Auth + Profil</p>
      </section>
      <nav aria-label="Mobil gezinme" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-800 bg-slate-950/95 px-2 py-3 backdrop-blur sm:hidden">
        {navigation.map((item, index) => <Link key={item} href={index === 3 ? "/profile" : "/"} className={`flex flex-col items-center gap-1 text-[11px] ${index === 0 ? "text-violet-300" : "text-slate-500"}`}><span className="text-lg" aria-hidden="true">{["◉", "◎", "◈", "○"][index]}</span>{item}</Link>)}
      </nav>
    </main>
  );
}
