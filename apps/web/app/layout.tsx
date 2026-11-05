import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { AppNavigation } from "@/components/app-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "NOVA CHAT",
  description: "Connect. Chat. Share.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="tr" className="dark">
      <body>
        <AuthProvider>
          <AppNavigation />
          <div className="min-h-screen pb-20 md:pb-0 md:pl-64">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
