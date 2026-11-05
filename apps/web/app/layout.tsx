import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";
export const metadata: Metadata = { title: "NOVA CHAT", description: "Connect. Chat. Share." };
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) { return <html lang="tr" className="dark"><body><AuthProvider>{children}</AuthProvider></body></html>; }
