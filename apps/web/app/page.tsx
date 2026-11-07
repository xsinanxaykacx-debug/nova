"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="nova-hero flex min-h-screen items-center justify-center px-5 py-16 text-center sm:px-8">
      <section className="mx-auto w-full max-w-3xl">
        <h1 className="text-6xl font-bold tracking-[0.12em] text-white sm:text-8xl">NABER</h1>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/login" className="nova-primary-button rounded-xl px-8 py-3.5 text-sm font-semibold transition">
            Giriş yap
          </Link>
          <Link href="/signup" className="nova-secondary-button rounded-xl px-8 py-3.5 text-sm font-semibold transition">
            Kayıt ol
          </Link>
        </div>
      </section>
    </main>
  );
}
