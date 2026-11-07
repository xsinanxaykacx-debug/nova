"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { MessagePayload } from "firebase/messaging";
import { getToken, onMessage } from "firebase/messaging";
import type { Session, User } from "@supabase/supabase-js";
import {
  createBrowserSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { firebaseVapidKey, getFirebaseMessaging } from "@/lib/firebase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  pushMessage: MessagePayload | null;
  enablePushNotifications: () => Promise<string>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  pushMessage: null,
  enablePushNotifications: async () => {
    throw new Error("Authentication is not ready.");
  },
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushMessage, setPushMessage] = useState<MessagePayload | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const supabase = createBrowserSupabaseClient();
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error("Unable to restore session:", error.message);
      setSession(data.session);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id;
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  // One authenticated, app-wide incoming-call listener. The /calls page
  // consumes the offer by ID from the URL; it does not open a second channel.
  useEffect(() => {
    if (!userId) return;

    let active = true;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(`incoming-call-router:${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "call_signals",
        filter: `receiver_id=eq.${userId}`,
      }, (event) => {
        if (!active) return;
        const row = event.new as { id: string; sender_id: string; receiver_id: string; signal_type: string };
        if (row.signal_type !== "offer" || row.sender_id === userId || row.receiver_id !== userId) return;

        const currentUrl = new URL(window.location.href);
        if (currentUrl.pathname !== "/calls" || currentUrl.searchParams.get("incoming") !== row.id) {
          routerRef.current.push(`/calls?incoming=${encodeURIComponent(row.id)}`);
        }
      })
      .subscribe((status, subscriptionError) => {
        // removeChannel() emits CLOSED during normal cleanup. Do not report
        // that expected lifecycle event as a Realtime failure.
        if (!active || status === "CLOSED" || status === "SUBSCRIBED") return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Global incoming-call subscription failed:", status, subscriptionError);
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setPushMessage(null);
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    void getFirebaseMessaging().then((messaging) => {
      if (!active || !messaging) return;
      unsubscribe = onMessage(messaging, (payload) => {
        if (active) setPushMessage(payload);
      });
    }).catch((error: unknown) => {
      console.error("Unable to initialize foreground push listener:", error);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [userId]);

  const enablePushNotifications = useCallback(async () => {
    if (!session?.user) throw new Error("Please sign in before enabling notifications.");
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      throw new Error("This browser does not support web notifications.");
    }
    if (!firebaseVapidKey) throw new Error("Firebase VAPID key is not configured.");

    if (Notification.permission === "denied") {
      throw new Error("Tarayıcı bildirim iznini daha önce engellemiş. Adres çubuğundaki site ayarlarından Bildirimler iznini Aç yapıp sayfayı yenile.");
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Bildirim izni verilmedi. Tarayıcı izin penceresinde İzin ver seçeneğine bas.");

    const messaging = await getFirebaseMessaging();
    if (!messaging) throw new Error("Firebase Messaging bu tarayıcıda desteklenmiyor.");

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(messaging, {
      vapidKey: firebaseVapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) throw new Error("Unable to get a Firebase notification token.");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("fcm_tokens").upsert(
      {
        user_id: session.user.id,
        token,
        platform: "web",
        updated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) throw new Error(`Could not save notification token: ${error.message}`);
    return token;
  }, [session?.user]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      pushMessage,
      enablePushNotifications,
    }),
    [session, loading, pushMessage, enablePushNotifications],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
