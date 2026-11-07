"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Plus,
  Search,
  Trash2,
  UserRound,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { NavigationRail } from "@/components/navigation-rail";
import { useAuth } from "@/components/auth-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useWebRTCCall, type CallKind, type IncomingCall } from "@/hooks/use-webrtc-call";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type CallRecord = {
  id: string;
  name: string;
  callerName: string;
  calleeName: string;
  direction: "incoming" | "outgoing";
  peerId: string;
  kind: CallKind;
  status: "ringing" | "answered" | "rejected" | "missed";
  createdAt: string;
};

function initials(value: string) {
  return value.trim().split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "N";
}

function getCallKind(call: IncomingCall): CallKind {
  return call.payload.sdp?.includes("m=video") ? "video" : "voice";
}

function VideoSurface({
  stream,
  videoRef,
  muted = false,
  className = "",
}: {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement>;
  muted?: boolean;
  className?: string;
}) {
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream, videoRef]);

  return <video ref={videoRef} autoPlay playsInline muted={muted} className={className} />;
}

function CallsPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const incomingSignalId = searchParams.get("incoming");
  const cancelledCallId = searchParams.get("cancelled");
  const cancelledSignalType = searchParams.get("cancelledType");
  const {
    incomingCall,
    status,
    localStream,
    remoteStream,
    activeCallId,
    error,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    setError,
  } = useWebRTCCall(user?.id ?? "", incomingSignalId, cancelledCallId, cancelledSignalType === "hangup" || cancelledSignalType === "reject" ? cancelledSignalType : null);

  const [term, setTerm] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"list" | "detail">("list");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyActionError, setHistoryActionError] = useState("");
  const [deletingCallId, setDeletingCallId] = useState<string | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState("");
  const [activePeer, setActivePeer] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const autoCallHandled = useRef<string | null>(null);

  const filteredCalls = useMemo(
    () => calls.filter((call) => `${call.callerName} ${call.calleeName}`.toLocaleLowerCase("tr-TR").includes(term.toLocaleLowerCase("tr-TR"))),
    [calls, term],
  );
  const loadCallHistory = useCallback(async () => {
    if (!user) return;
    const client = createBrowserSupabaseClient();
    const { data, error: historyQueryError } = await client.from("call_history")
      .select("id, call_id, caller_id, callee_id, call_type, status, started_at, ended_at")
      .or(`and(caller_id.eq.${user.id},caller_deleted_at.is.null),and(callee_id.eq.${user.id},callee_deleted_at.is.null)`)
      .order("started_at", { ascending: false }).limit(100);
    if (historyQueryError) {
      setHistoryError("Arama geçmişi yüklenemedi. Veritabanı migration'ını ve bağlantını kontrol et.");
      setHistoryLoading(false);
      return;
    }
    const participantIds = [...new Set((data ?? []).flatMap((row) => [row.caller_id, row.callee_id]))];
    const { data: people } = participantIds.length
      ? await client.from("profiles").select("id, username, display_name").in("id", participantIds)
      : { data: [] as { id: string; username: string; display_name: string }[] };
    const names = new Map((people ?? []).map((person) => [person.id, person.display_name || person.username || "NOVA kullanıcısı"]));
    setCalls((data ?? []).map((row) => {
      const outgoing = row.caller_id === user.id;
      const callerName = names.get(row.caller_id) || "NOVA kullanıcısı";
      const calleeName = names.get(row.callee_id) || "NOVA kullanıcısı";
      return { id: row.id, name: outgoing ? calleeName : callerName, callerName, calleeName,
        direction: outgoing ? "outgoing" : "incoming", peerId: outgoing ? row.callee_id : row.caller_id,
        kind: row.call_type, status: row.status, createdAt: row.started_at } as CallRecord;
    }));
    setHistoryError("");
    setHistoryLoading(false);
  }, [user]);

  async function deleteCallHistoryEntry(call: CallRecord) {
    if (!user || deletingCallId || clearingHistory) return;
    if (!window.confirm("Bu arama kaydını kendi geçmişinden silmek istiyor musun?")) return;

    setDeletingCallId(call.id);
    setHistoryActionError("");
    const client = createBrowserSupabaseClient();
    const deletedAt = new Date().toISOString();
    const isCaller = call.direction === "outgoing";
    const { error: deleteError } = await client.from("call_history")
      .update(isCaller ? { caller_deleted_at: deletedAt } : { callee_deleted_at: deletedAt })
      .eq("id", call.id)
      .eq(isCaller ? "caller_id" : "callee_id", user.id);

    if (deleteError) {
      setHistoryActionError("Arama kaydı silinemedi. Tekrar dene.");
      setDeletingCallId(null);
      return;
    }

    setCalls((current) => current.filter((item) => item.id !== call.id));
    setDeletingCallId(null);
  }

  async function clearCallHistory() {
    if (!user || clearingHistory || deletingCallId || calls.length === 0) return;
    if (!window.confirm("Arama geçmişindeki tüm kayıtları kendi hesabından temizlemek istiyor musun?")) return;

    setClearingHistory(true);
    setHistoryActionError("");
    const client = createBrowserSupabaseClient();
    const deletedAt = new Date().toISOString();
    const [callerResult, calleeResult] = await Promise.all([
      client.from("call_history").update({ caller_deleted_at: deletedAt })
        .eq("caller_id", user.id).is("caller_deleted_at", null),
      client.from("call_history").update({ callee_deleted_at: deletedAt })
        .eq("callee_id", user.id).is("callee_deleted_at", null),
    ]);

    if (callerResult.error || calleeResult.error) {
      setHistoryActionError("Arama geçmişi tamamen temizlenemedi. Tekrar dene.");
      await loadCallHistory();
    } else {
      setCalls([]);
    }
    setClearingHistory(false);
  }

  useEffect(() => {
    if (!user) return;
    void loadCallHistory();
    const channel = createBrowserSupabaseClient().channel(`call-history:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "call_history" }, () => { void loadCallHistory(); })
      .subscribe();
    return () => { void createBrowserSupabaseClient().removeChannel(channel); };
  }, [user, loadCallHistory]);

  const filteredProfiles = useMemo(() => {
    const value = searchTerm.trim().toLocaleLowerCase("tr-TR");
    if (!value) return profiles;
    return profiles.filter((profile) =>
      [profile.display_name, profile.username].some((field) => field.toLocaleLowerCase("tr-TR").includes(value)),
    );
  }, [profiles, searchTerm]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!incomingCall) return;
    setMobilePanel("detail");
    const known = profiles.find((profile) => profile.id === incomingCall.sender_id);
    if (known) {
      setActivePeer(known);
      return;
    }
    let active = true;
    void createBrowserSupabaseClient()
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("id", incomingCall.sender_id)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setActivePeer(data as Profile);
      });
    return () => { active = false; };
  }, [incomingCall, profiles]);

  useEffect(() => {
    if (loading || !user || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const targetUserId = params.get("user");
    if (!targetUserId || autoCallHandled.current === targetUserId) return;

    autoCallHandled.current = targetUserId;
    const currentUserId = user.id;
    const kind: CallKind = params.get("kind") === "video" ? "video" : "voice";
    window.history.replaceState(null, "", "/calls");

    let active = true;
    async function startRequestedCall() {
      setBusy(true);
      setError("");
      try {
        const { data, error: profileError } = await createBrowserSupabaseClient()
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .eq("id", targetUserId)
          .maybeSingle();
        if (!active) return;
        if (profileError || !data) throw new Error("Aranacak kullan\u0131c\u0131 bulunamad\u0131.");
        const profile = data as Profile;
        if (profile.id === currentUserId) throw new Error("Kendini arayamazs\u0131n.");
        setActivePeer(profile);
        setMobilePanel("detail");
        await startCall(profile.id, kind);
      } catch (cause) {
        if (!active) return;
        setActivePeer(null);
        setError(cause instanceof Error ? cause.message : "Arama ba\u015flat\u0131lamad\u0131.");
      } finally {
        if (active) setBusy(false);
      }
    }

    void startRequestedCall();
    return () => { active = false; };
  }, [loading, user, startCall, setError]);

  useEffect(() => {
    if (activeCallId) {
      setMicEnabled(true);
      setCameraEnabled(true);
    }
  }, [activeCallId]);

  async function loadProfiles() {
    if (!user) return;
    setProfilesLoading(true);
    setProfilesError("");
    const { data, error: queryError } = await createBrowserSupabaseClient()
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .neq("id", user.id)
      .order("display_name", { ascending: true })
      .limit(100);
    setProfilesLoading(false);
    if (queryError) {
      setProfilesError("Kişiler yüklenemedi. Tekrar dene.");
      return;
    }
    setProfiles((data ?? []) as Profile[]);
  }

  async function openUserSearch() {
    setMobilePanel("detail");
    setSearchOpen(true);
    setSearchTerm("");
    if (profiles.length === 0) await loadProfiles();
  }

  async function callUser(profile: Profile, kind: CallKind) {
    setMobilePanel("detail");
    setBusy(true);
    setError("");
    setActivePeer(profile);
    try {
      await startCall(profile.id, kind);
      setSearchOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Arama başlatılamadı.");
      setActivePeer(null);
    } finally {
      setBusy(false);
    }
  }

  async function acceptIncoming() {
    if (!incomingCall) return;
    setBusy(true);
    setError("");
    try {
      await acceptCall(incomingCall, getCallKind(incomingCall));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Arama kabul edilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function declineIncoming() {
    if (!incomingCall) return;
    setBusy(true);
    try {
      await rejectCall(incomingCall);
      setActivePeer(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Arama reddedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function endCall() {
    setBusy(true);
    await hangUp();
    setActivePeer(null);
    setBusy(false);
  }

  function toggleMicrophone() {
    const next = !micEnabled;
    localStream?.getAudioTracks().forEach((track) => { track.enabled = next; });
    setMicEnabled(next);
  }

  function toggleCamera() {
    const next = !cameraEnabled;
    localStream?.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCameraEnabled(next);
  }

  const hasRemoteVideo = Boolean(remoteStream?.getVideoTracks().some((track) => track.readyState === "live"));
  const hasLocalVideo = Boolean(localStream?.getVideoTracks().some((track) => track.readyState === "live"));
  const isCallActive = Boolean(activeCallId);
  const incomingKind = incomingCall ? getCallKind(incomingCall) : "voice";
  const peerName = activePeer?.display_name || activePeer?.username || "NOVA kullanıcısı";

  if (loading || !user) {
    return <main className="flex h-[100dvh] items-center justify-center bg-[#0f172a] text-sm text-slate-400">Oturum kontrol ediliyor...</main>;
  }

  return (
    <main className="chat-app-shell flex h-[100dvh] min-h-[560px] overflow-hidden text-slate-100">
      <NavigationRail />
      <aside className={`calls-sidebar ${mobilePanel === "list" ? "flex" : "hidden"} h-full min-h-0 w-[320px] shrink-0 flex-col border-r border-slate-700/70 md:flex`}>
        <header className="calls-heading flex h-[68px] shrink-0 items-center justify-between px-5">
          <h1 className="text-[19px] font-semibold text-slate-300">Aramalar</h1>
          <div className="flex items-center gap-2">
            {calls.length > 0 && (
              <button type="button" onClick={() => void clearCallHistory()} disabled={clearingHistory || deletingCallId !== null}
                aria-label="Tümünü Temizle" title="Tümünü Temizle" className="call-heading-action text-rose-300 hover:text-rose-200 disabled:opacity-40">
                {clearingHistory ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={19} />}
              </button>
            )}
            <button type="button" onClick={() => void openUserSearch()} aria-label="Kullanıcı Ara" title="Kullanıcı Ara" className="call-heading-action">
              <span className="relative inline-flex"><PhoneCall size={20} /><Plus size={11} className="absolute -right-1 -top-1 rounded-full bg-[#111a2d]" /></span>
            </button>
          </div>
        </header>
        <div className="chat-search-wrap shrink-0 px-5 pb-4">
          <label className="search-field chat-search-field"><span className="text-slate-400"><Search size={17} /></span><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Aramalarda ara" aria-label="Aramalarda ara" /></label>
        </div>
        <section className="min-h-0 flex-1 overflow-y-auto border-t border-slate-700/50 px-2 py-3">
          {historyActionError && <p role="alert" className="mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{historyActionError}</p>}
          {filteredCalls.length ? filteredCalls.map((call) => (
            <div key={call.id} className="call-history-row">
              <button type="button" onClick={() => { setActivePeer({ id: call.peerId, username: "", display_name: call.name, avatar_url: null }); setMobilePanel("detail"); }}
                className="call-person min-w-0 flex-1 text-left">
                <span className="call-avatar shrink-0">{call.direction === "outgoing" ? <PhoneOutgoing size={18} /> : <PhoneIncoming size={18} />}</span>
                <span className="min-w-0 flex-1 overflow-hidden"><strong className="block truncate">{call.callerName} → {call.calleeName}</strong><small className="block truncate">{call.direction === "incoming" ? "Gelen" : "Giden"} · {call.status === "answered" ? "Cevaplandı" : call.status === "rejected" ? "Reddedildi" : call.status === "missed" ? "Kaçırıldı" : "Aranıyor"} · {call.kind === "voice" ? "Sesli arama" : "Görüntülü arama"}</small></span>
                <time className="shrink-0 whitespace-nowrap">{new Date(call.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</time>
              </button>
              <button type="button" onClick={() => void deleteCallHistoryEntry(call)}
                disabled={clearingHistory || deletingCallId !== null}
                aria-label="Arama kaydını sil" title="Arama kaydını sil"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40">
                {deletingCallId === call.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </button>
            </div>
          )) : <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-5 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400"><Phone size={22} /></span>
            <p className="text-sm font-medium text-slate-300">{historyLoading ? "Arama geçmişi yükleniyor..." : historyError || (term ? "Eşleşen arama yok" : "Henüz arama yok")}</p>
            <p className="mt-2 text-xs text-slate-500">{historyError ? "Veritabanı bağlantısını kontrol edip tekrar dene." : "Yeni bir arama başlatmak için Kullanıcı Ara seçeneğini kullan."}</p>
            <button type="button" onClick={() => void openUserSearch()} className="mt-5 rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25">Kullanıcı Ara</button>
          </div>}
        </section>
      </aside>

      <section className={`calls-detail-panel relative min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-6 md:px-8 ${mobilePanel === "detail" ? "flex" : "hidden"} md:flex`}>
        {!isCallActive && !incomingCall && (
          <button type="button" onClick={() => setMobilePanel("list")} aria-label="Arama listesine dön"
            className="absolute left-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900/80 text-slate-200 md:hidden">
            <ArrowLeft size={19} />
          </button>
        )}
        {isCallActive ? (
          <div className="flex h-full w-full max-w-5xl flex-col">
            <header className="flex shrink-0 items-center justify-between py-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/70">{status === "connected" ? "Bağlandı" : status === "calling" ? "Aranıyor" : "Bağlantı kuruluyor"}</p>
                <h2 className="mt-1 truncate text-lg font-semibold text-white">{peerName}</h2>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">{hasRemoteVideo ? "Görüntülü arama" : "Sesli arama"}</span>
            </header>
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-[#080e1b]">
              {hasRemoteVideo ? (
                <VideoSurface stream={remoteStream} videoRef={remoteVideoRef} className="h-full w-full object-contain" />
              ) : (
                <>
                  <VideoSurface stream={remoteStream} videoRef={remoteVideoRef} className="hidden" />
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-28 w-28 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/10 text-3xl font-semibold text-cyan-100">{initials(peerName)}</div>
                    <p className="mt-5 text-lg font-medium text-slate-200">{peerName}</p>
                    <p className="mt-2 text-sm text-slate-500">{status === "connected" ? "Sesli görüşme devam ediyor" : "Karşı tarafın bağlantısı bekleniyor..."}</p>
                  </div>
                </>
              )}
              {hasLocalVideo && (
                <div className="absolute bottom-4 right-4 h-28 w-40 overflow-hidden rounded-2xl border border-white/20 bg-slate-900 shadow-xl sm:h-36 sm:w-52">
                  <VideoSurface stream={localStream} videoRef={localVideoRef} muted className="h-full w-full object-cover" />
                </div>
              )}
              {!hasLocalVideo && <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />}
              {status !== "connected" && <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-2 text-xs text-slate-300"><Loader2 size={14} className="animate-spin" /> Bağlantı bekleniyor</div>}
            </div>
            <div className="mx-auto flex w-full max-w-[360px] shrink-0 flex-wrap items-center justify-center gap-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 md:max-w-none md:flex-nowrap md:gap-3 md:py-6 md:pb-6">
              <button type="button" onClick={toggleMicrophone} aria-label={micEnabled ? "Mikrofonu Kapat" : "Mikrofonu Aç"} title={micEnabled ? "Mikrofonu Kapat" : "Mikrofonu Aç"} className={`flex h-12 min-w-0 basis-[calc(50%-0.25rem)] items-center justify-center gap-2 rounded-full border px-2 text-[11px] font-medium sm:px-4 sm:text-xs md:basis-auto ${micEnabled ? "border-white/10 bg-white/10 text-white" : "border-rose-400/40 bg-rose-500/20 text-rose-200"}`}>{micEnabled ? <Mic size={18} /> : <MicOff size={18} />}{micEnabled ? "Mikrofonu Kapat" : "Mikrofonu Aç"}</button>
              <button type="button" onClick={toggleCamera} disabled={!hasLocalVideo} aria-label={cameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"} title={cameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"} className={`flex h-12 min-w-0 basis-[calc(50%-0.25rem)] items-center justify-center gap-2 rounded-full border px-2 text-[11px] font-medium sm:px-4 sm:text-xs md:basis-auto disabled:opacity-30 ${cameraEnabled ? "border-white/10 bg-white/10 text-white" : "border-rose-400/40 bg-rose-500/20 text-rose-200"}`}>{cameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}{cameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"}</button>
              <button type="button" onClick={() => void endCall()} disabled={busy} aria-label="Aramayı Bitir" title="Aramayı Bitir" className="flex h-12 basis-full items-center justify-center gap-2 rounded-full bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50 md:basis-auto"><PhoneOff size={18} /> Aramayı Bitir</button>
            </div>
          </div>
        ) : incomingCall ? (
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-200"><PhoneIncoming size={32} /></div>
            <p className="mt-6 text-xs uppercase tracking-[0.2em] text-cyan-300/70">Gelen {incomingKind === "video" ? "görüntülü" : "sesli"} arama</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{peerName}</h2>
            <p className="mt-2 text-sm text-slate-400">@{activePeer?.username || "nova-kullanıcısı"}</p>
            <div className="mt-8 flex justify-center gap-3">
              <button type="button" onClick={() => void declineIncoming()} disabled={busy} className="flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-5 py-3 text-sm font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"><PhoneOff size={17} /> Reddet</button>
              <button type="button" onClick={() => void acceptIncoming()} disabled={busy} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"><Phone size={17} /> Kabul Et</button>
            </div>
          </div>
        ) : (
          <div className="flex w-full max-w-md flex-col items-center text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-cyan-300/15 bg-cyan-400/10 text-cyan-200"><PhoneCall size={38} strokeWidth={1.4} /></div>
            <h2 className="mt-7 text-2xl font-semibold text-white">NOVA Aramalar</h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">{activePeer ? `${peerName} ile güvenli sesli veya görüntülü görüşme başlat.` : "Kişilerinden birini seçerek güvenli sesli veya görüntülü görüşme başlat."}</p>
            <button type="button" onClick={() => void openUserSearch()} className="mt-7 flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400"><Search size={18} /> Kullanıcı Ara</button>
            <p className="mt-4 text-xs text-slate-500">Ses ve görüntü WebRTC üzerinden eşten eşe iletilir.</p>
          </div>
        )}

        {error && <div role="alert" className="absolute bottom-3 left-4 right-4 mx-auto max-w-2xl rounded-xl border border-rose-400/30 bg-rose-950/80 px-4 py-3 text-sm text-rose-100 shadow-xl">{error}</div>}
      </section>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="call-user-search-title" className="flex max-h-[min(680px,90dvh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#111b2e] shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-700/70 px-5 py-4">
              <h2 id="call-user-search-title" className="text-lg font-semibold text-white">Kullanıcı Ara</h2>
              <button type="button" onClick={() => setSearchOpen(false)} aria-label="Kapat" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X size={19} /></button>
            </header>
            <div className="p-4">
              <label className="search-field chat-search-field"><Search size={17} /><input autoFocus value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="İsim veya kullanıcı adı..." aria-label="Kişi ara" /></label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
              {profilesLoading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 size={17} className="animate-spin" /> Kişiler yükleniyor...</div>
                : profilesError ? <p role="alert" className="px-3 py-8 text-center text-sm text-rose-300">{profilesError}</p>
                : filteredProfiles.length ? filteredProfiles.map((profile) => (
                  <div key={profile.id} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cyan-400/10 text-sm font-semibold text-cyan-100">
                      {profile.avatar_url ? <Image src={profile.avatar_url} alt="" width={44} height={44} unoptimized className="h-full w-full object-cover" /> : initials(profile.display_name || profile.username)}
                    </span>
                    <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-100">{profile.display_name || profile.username}</strong><small className="text-xs text-slate-400">@{profile.username}</small></span>
                    <button type="button" disabled={busy} onClick={() => void callUser(profile, "voice")} title="Sesli ara" aria-label={`${profile.display_name} sesli ara`} className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"><Phone size={17} /></button>
                    <button type="button" disabled={busy} onClick={() => void callUser(profile, "video")} title="Görüntülü ara" aria-label={`${profile.display_name} görüntülü ara`} className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40"><Video size={17} /></button>
                  </div>
                )) : <div className="py-10 text-center text-sm text-slate-500">{searchTerm ? "Kullanıcı bulunamadı." : "Aranabilecek başka kullanıcı yok."}</div>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={<main className="flex h-[100dvh] items-center justify-center bg-[#0f172a] text-sm text-slate-400">Aramalar yükleniyor...</main>}>
      <CallsPageContent />
    </Suspense>
  );
}
