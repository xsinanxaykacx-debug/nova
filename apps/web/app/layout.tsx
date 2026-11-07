import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "NABER",
  description: "NABER — Güvenli ve özel mesajlaşma.",
  icons: {
    icon: "/icon-192.png",
    shortcut: "/favicon.ico",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="tr" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#001122" />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
