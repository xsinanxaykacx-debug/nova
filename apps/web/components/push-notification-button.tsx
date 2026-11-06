"use client";

import { useState } from "react";
import { Bell, BellRing, LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

type PushNotificationButtonProps = { mobile?: boolean };

export function PushNotificationButton({ mobile = false }: PushNotificationButtonProps) {
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
  const className = mobile ? "mobile-nav-link" : "rail-link";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        void enableNotifications();
      }}
      disabled={busy || enabled}
      aria-label={label}
      aria-busy={busy}
      title={label}
      data-tooltip={mobile ? undefined : label}
      className={`${className} disabled:cursor-default disabled:opacity-80`}
    >
      {busy ? <LoaderCircle size={20} className="animate-spin" /> : enabled ? <BellRing size={20} className="text-sky-400" /> : <Bell size={20} />}
      {mobile && <span>{enabled ? "Açık" : "Bildirim"}</span>}
      <span className="sr-only" role="status" aria-live="polite">{error || (enabled ? "Bildirimler açıldı" : "")}</span>
    </button>
  );
}
