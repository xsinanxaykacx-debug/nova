"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, BellRing, LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

type PushNotificationButtonProps = { mobile?: boolean };

export function PushNotificationButton({ mobile = false }: PushNotificationButtonProps) {
  const pathname = usePathname();
  const notificationsActive = pathname === "/notifications" || pathname.startsWith("/notifications/") || pathname === "/alerts" || pathname.startsWith("/alerts/");
  const { user, enablePushNotifications } = useAuth();
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");

  if (!user) return null;

  async function enableNotifications() {
    if (busy || enabled) return;
    setBusy(true);
    setError("");
    try {
      await enablePushNotifications();
      setEnabled(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bildirimler açılamadı. Tekrar dene.");
    } finally {
      setBusy(false);
    }
  }

  const label = enabled ? "Bildirimler açıldı" : error || "Bildirimleri aç";
  const className = mobile ? `mobile-nav-link ${notificationsActive ? "mobile-nav-active" : ""}` : `rail-link ${notificationsActive ? "rail-link-active" : ""}`;

  return (
    <button
      type="button"
      onClick={() => void enableNotifications()}
      disabled={busy || enabled}
      aria-label={label}
      aria-busy={busy}
      aria-current={notificationsActive ? "page" : undefined}
      title={label}
      data-tooltip={mobile ? undefined : label}
      className={`${className} disabled:cursor-default disabled:opacity-80`}
    >
      {busy ? <LoaderCircle size={20} className="animate-spin" /> : enabled ? <BellRing size={20} className={notificationsActive ? "text-sky-400" : ""} /> : <Bell size={20} className={notificationsActive ? "text-sky-400" : ""} />}
      {mobile && <span>{enabled ? "Açık" : "Bildirim"}</span>}
      {error && <span className={`push-notification-feedback ${mobile ? "push-notification-feedback-mobile" : ""}`} role="alert">{error}</span>}
      <span className="sr-only" role="status" aria-live="polite">{enabled ? "Bildirimler açıldı" : ""}</span>
    </button>
  );
}
