"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type CallKind = "voice" | "video";
export type IncomingCall = {
  id: string;
  call_id: string;
  sender_id: string;
  receiver_id: string;
  signal_type: "offer";
  payload: RTCSessionDescriptionInit;
  created_at: string;
};

type SignalType = "offer" | "answer" | "ice" | "ready" | "hangup" | "reject";
type CallSignal = {
  call_id: string;
  sender_id: string;
  receiver_id: string;
  signal_type: SignalType;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit | Record<string, never>;
};

type CallStatus = "idle" | "calling" | "ringing" | "connecting" | "connected";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export function useWebRTCCall(userId: string, incomingSignalId?: string | null) {
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const incomingChannelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const negotiationReadyRef = useRef(false);
  const remoteReadyRef = useRef(false);
  const readyAckSentRef = useRef(false);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const cancelledCallIdsRef = useRef(new Set<string>());
  const localIceQueueRef = useRef<CallSignal[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const supabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createBrowserSupabaseClient();
    return supabaseRef.current;
  }, []);

  const sendBroadcast = useCallback(async (payload: CallSignal) => {
    const channel = channelRef.current;
    if (!channel) throw new Error("Arama kanalı henüz hazır değil.");
    const result = await channel.send({ type: "broadcast", event: "signal", payload });
    if (result !== "ok") throw new Error("Arama sinyali gönderilemedi.");
  }, []);

  const flushLocalIce = useCallback(async () => {
    if (!remoteReadyRef.current) return;
    const queued = localIceQueueRef.current.splice(0);
    for (const signal of queued) await sendBroadcast(signal);
  }, [sendBroadcast]);

  const ensureMedia = useCallback(async (kind: CallKind) => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Bu tarayıcı kamera ve mikrofon erişimini desteklemiyor. HTTPS bağlantısı kullan.");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === "video" ? { facingMode: "user" } : false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        throw new Error("Kamera veya mikrofon izni verilmedi. Tarayıcı site izinlerinden erişime izin ver.");
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        throw new Error("Kullanılabilir kamera veya mikrofon bulunamadı.");
      }
      throw new Error(cause instanceof Error ? cause.message : "Kamera ve mikrofon açılamadı.");
    }
  }, []);

  const removeCallChannel = useCallback(async () => {
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel && supabaseRef.current) await supabaseRef.current.removeChannel(channel);
  }, []);

  const resetCall = useCallback(async () => {
    await removeCallChannel();
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    callIdRef.current = null;
    peerIdRef.current = null;
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    negotiationReadyRef.current = false;
    remoteReadyRef.current = false;
    readyAckSentRef.current = false;
    pendingIceRef.current = [];
    localIceQueueRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCallId(null);
    setIncomingCall(null);
    setStatus("idle");
  }, [removeCallChannel]);

  const attachRemoteCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = peerRef.current;
    if (!pc?.remoteDescription) {
      pendingIceRef.current.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (cause) {
      if (!ignoreOfferRef.current) throw cause;
    }
  }, []);

  const flushRemoteCandidates = useCallback(async () => {
    const queued = pendingIceRef.current.splice(0);
    for (const candidate of queued) await attachRemoteCandidate(candidate);
  }, [attachRemoteCandidate]);

  const createPeer = useCallback((remoteUserId: string, polite: boolean) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });
    peerRef.current = pc;
    peerIdRef.current = remoteUserId;
    negotiationReadyRef.current = false;

    pc.onicecandidate = (event) => {
      if (!event.candidate || !callIdRef.current) return;
      const signal: CallSignal = {
        call_id: callIdRef.current,
        sender_id: userId,
        receiver_id: remoteUserId,
        signal_type: "ice",
        payload: event.candidate.toJSON(),
      };
      if (remoteReadyRef.current) {
        void sendBroadcast(signal).catch((cause) => setError(cause instanceof Error ? cause.message : "ICE sinyali gönderilemedi."));
      } else {
        localIceQueueRef.current.push(signal);
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? remoteStreamRef.current ?? new MediaStream();
      if (!event.streams[0] && !stream.getTracks().some((track) => track.id === event.track.id)) {
        stream.addTrack(event.track);
      }
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("connected");
      if (pc.connectionState === "failed") {
        setError("Bağlantı kurulamadı. Bu ağ STUN bağlantısını engelliyor olabilir; TURN desteği gerekiyor.");
        setStatus("connecting");
      }
      if (pc.connectionState === "disconnected") setStatus("connecting");
    };

    pc.onnegotiationneeded = async () => {
      if (!negotiationReadyRef.current || pc.signalingState !== "stable" || !callIdRef.current) return;
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        await sendBroadcast({
          call_id: callIdRef.current,
          sender_id: userId,
          receiver_id: remoteUserId,
          signal_type: "offer",
          payload: pc.localDescription as RTCSessionDescriptionInit,
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Bağlantı yeniden müzakere edilemedi.");
      } finally {
        makingOfferRef.current = false;
      }
    };

    return pc;
  }, [sendBroadcast, userId]);

  const announceReady = useCallback(async () => {
    const callId = callIdRef.current;
    const remoteUserId = peerIdRef.current;
    if (!callId || !remoteUserId) return;
    await sendBroadcast({
      call_id: callId,
      sender_id: userId,
      receiver_id: remoteUserId,
      signal_type: "ready",
      payload: {},
    });
  }, [sendBroadcast, userId]);

  const attachCallChannel = useCallback(async (callId: string, remoteUserId: string, polite: boolean) => {
    const channel = supabase().channel(`call:${callId}`, {
      config: { private: true, broadcast: { ack: true, self: false } },
    });

    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      const signal = payload as CallSignal;
      if (signal.sender_id !== remoteUserId || signal.call_id !== callId) return;

      if (signal.signal_type === "ready") {
        remoteReadyRef.current = true;
        void flushLocalIce().catch((cause) => setError(cause instanceof Error ? cause.message : "ICE adayları gönderilemedi."));
        if (!readyAckSentRef.current) {
          readyAckSentRef.current = true;
          void announceReady().catch((cause) => setError(cause instanceof Error ? cause.message : "Arama hazır sinyali gönderilemedi."));
        }
        return;
      }

      if (signal.signal_type === "hangup" || signal.signal_type === "reject") {
        if (signal.signal_type === "reject") setError("Karşı taraf aramayı reddetti.");
        void resetCall();
        return;
      }

      if (signal.signal_type === "ice") {
        void attachRemoteCandidate(signal.payload as RTCIceCandidateInit).catch((cause) => {
          setError(cause instanceof Error ? cause.message : "ICE adayı eklenemedi.");
        });
        return;
      }

      const description = signal.payload as RTCSessionDescriptionInit;
      const pc = peerRef.current;
      if (!pc) return;
      void (async () => {
        const offerCollision = description.type === "offer" &&
          (makingOfferRef.current || pc.signalingState !== "stable");
        ignoreOfferRef.current = !polite && offerCollision;
        if (ignoreOfferRef.current) return;
        await pc.setRemoteDescription(new RTCSessionDescription(description));
        await flushRemoteCandidates();
        if (description.type === "offer") {
          await pc.setLocalDescription(await pc.createAnswer());
          await sendBroadcast({
            call_id: callId,
            sender_id: userId,
            receiver_id: remoteUserId,
            signal_type: "answer",
            payload: pc.localDescription as RTCSessionDescriptionInit,
          });
        }
      })().catch((cause) => setError(cause instanceof Error ? cause.message : "Arama sinyali işlenemedi."));
    });

    channelRef.current = channel;
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((state) => {
        if (state === "SUBSCRIBED") resolve();
        if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          reject(new Error("Arama sinyal kanalına bağlanılamadı."));
        }
      });
    });
    return channel;
  }, [announceReady, attachRemoteCandidate, flushLocalIce, flushRemoteCandidates, resetCall, sendBroadcast, supabase, userId]);

  const startCall = useCallback(async (receiverId: string, kind: CallKind) => {
    setError("");
    if (!receiverId || receiverId === userId) throw new Error("Geçerli bir kullanıcı seç.");
    const stream = await ensureMedia(kind);
    const callId = crypto.randomUUID();
    const polite = userId.localeCompare(receiverId) > 0;
    const pc = createPeer(receiverId, polite);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    callIdRef.current = callId;
    setActiveCallId(callId);
    setStatus("calling");

    try {
      makingOfferRef.current = true;
      await pc.setLocalDescription(await pc.createOffer());
      const seed: CallSignal = {
        call_id: callId,
        sender_id: userId,
        receiver_id: receiverId,
        signal_type: "offer",
        payload: pc.localDescription as RTCSessionDescriptionInit,
      };
      const { error: historyInsertError } = await supabase().from("call_history").insert({
        call_id: callId, caller_id: userId, callee_id: receiverId, call_type: kind, status: "ringing",
      });
      if (historyInsertError) setError("Arama geçmişi kaydedilemedi: " + historyInsertError.message);
      const { error: insertError } = await supabase().from("call_signals").insert(seed);
      if (insertError) throw new Error("Arama başlatılamadı: " + insertError.message);
      await attachCallChannel(callId, receiverId, polite);
      await sendBroadcast(seed);
      negotiationReadyRef.current = true;
      await announceReady();
    } catch (cause) {
      await supabase().from("call_history").update({ status: "missed", ended_at: new Date().toISOString() }).eq("call_id", callId).eq("status", "ringing");
      await resetCall();
      throw cause;
    } finally {
      makingOfferRef.current = false;
    }
    return callId;
  }, [announceReady, attachCallChannel, createPeer, ensureMedia, resetCall, sendBroadcast, supabase, userId]);

  const acceptCall = useCallback(async (call: IncomingCall, kind: CallKind) => {
    setError("");
    const stream = await ensureMedia(kind);
    const polite = userId.localeCompare(call.sender_id) > 0;
    const pc = createPeer(call.sender_id, polite);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    callIdRef.current = call.call_id;
    setActiveCallId(call.call_id);
    setStatus("connecting");

    try {
      await attachCallChannel(call.call_id, call.sender_id, polite);
      await announceReady();
      await pc.setRemoteDescription(new RTCSessionDescription(call.payload));
      await flushRemoteCandidates();
      await pc.setLocalDescription(await pc.createAnswer());
      await sendBroadcast({
        call_id: call.call_id,
        sender_id: userId,
        receiver_id: call.sender_id,
        signal_type: "answer",
        payload: pc.localDescription as RTCSessionDescriptionInit,
      });
      negotiationReadyRef.current = true;
      const { error: historyError } = await supabase().from("call_history").update({ status: "answered" }).eq("call_id", call.call_id);
      if (historyError) setError("Arama bağlandı ancak geçmiş güncellenemedi: " + historyError.message);
      setIncomingCall(null);
    } catch (cause) {
      await resetCall();
      throw cause;
    }
  }, [announceReady, attachCallChannel, createPeer, ensureMedia, flushRemoteCandidates, resetCall, sendBroadcast, supabase, userId]);

  const rejectCall = useCallback(async (call: IncomingCall) => {
    try {
      const { error: historyError } = await supabase().from("call_history").update({ status: "rejected", ended_at: new Date().toISOString() }).eq("call_id", call.call_id);
      if (historyError) setError("Arama geçmişi güncellenemedi: " + historyError.message);
      const polite = userId.localeCompare(call.sender_id) > 0;
      callIdRef.current = call.call_id;
      peerIdRef.current = call.sender_id;
      await attachCallChannel(call.call_id, call.sender_id, polite);
      const { error: signalError } = await supabase().from("call_signals").insert({
        call_id: call.call_id, sender_id: userId, receiver_id: call.sender_id, signal_type: "reject", payload: {},
      });
      if (signalError) setError("Arama reddetme sinyali gönderilemedi: " + signalError.message);
      await sendBroadcast({
        call_id: call.call_id,
        sender_id: userId,
        receiver_id: call.sender_id,
        signal_type: "reject",
        payload: {},
      });
    } finally {
      await resetCall();
    }
  }, [attachCallChannel, resetCall, sendBroadcast, supabase, userId]);

  const hangUp = useCallback(async () => {
    const callId = callIdRef.current;
    if (callId) {
      const endedAt = new Date().toISOString();
      const { error: missedError } = await supabase().from("call_history").update({ status: "missed", ended_at: endedAt }).eq("call_id", callId).eq("status", "ringing");
      if (missedError) setError("Arama geçmişi güncellenemedi: " + missedError.message);
      const { error: endedError } = await supabase().from("call_history").update({ ended_at: endedAt }).eq("call_id", callId).eq("status", "answered");
      if (endedError) setError("Arama bitiş zamanı kaydedilemedi: " + endedError.message);
      if (peerIdRef.current) {
        const { error: signalError } = await supabase().from("call_signals").insert({
          call_id: callId, sender_id: userId, receiver_id: peerIdRef.current, signal_type: "hangup", payload: {},
        });
        if (signalError) setError("Arama bitiş sinyali gönderilemedi: " + signalError.message);
      }
    }
    if (callId && peerIdRef.current) {
      await sendBroadcast({
        call_id: callId,
        sender_id: userId,
        receiver_id: peerIdRef.current,
        signal_type: "hangup",
        payload: {},
      }).catch(() => undefined);
    }
    await resetCall();
  }, [resetCall, sendBroadcast, supabase, userId]);

  useEffect(() => {
    if (!userId || !incomingSignalId) return;
    let active = true;
    void supabase()
      .from("call_signals")
      .select("id, call_id, sender_id, receiver_id, signal_type, payload, created_at")
      .eq("id", incomingSignalId)
      .eq("receiver_id", userId)
      .eq("signal_type", "offer")
      .maybeSingle()
      .then(async ({ data, error: lookupError }) => {
        if (!active) return;
        if (lookupError) {
          setError("Gelen arama alınamadı: " + lookupError.message);
          return;
        }
        if (!data || data.sender_id === userId) return;
        const { data: terminalSignals, error: terminalLookupError } = await supabase()
          .from("call_signals")
          .select("id")
          .eq("call_id", data.call_id)
          .in("signal_type", ["hangup", "reject"])
          .limit(1);
        if (!active) return;
        if (terminalLookupError) {
          setError("Arama durumu kontrol edilemedi: " + terminalLookupError.message);
          return;
        }
        if (terminalSignals?.length || cancelledCallIdsRef.current.has(data.call_id)) {
          await supabase().from("call_signals").delete().eq("call_id", data.call_id);
          return;
        }
        setIncomingCall(data as IncomingCall);
        setStatus("ringing");
        const url = new URL(window.location.href);
        url.searchParams.delete("incoming");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      });
    return () => { active = false; };
  }, [incomingSignalId, supabase, userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase().channel(`incoming-calls:${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "call_signals",
        filter: `receiver_id=eq.${userId}`,
      }, (event) => {
        const row = event.new as CallSignal & { id?: string };
        if (row.signal_type === "hangup" || row.signal_type === "reject") {
          cancelledCallIdsRef.current.add(row.call_id);
          if (callIdRef.current === row.call_id) {
            if (row.signal_type === "reject") setError("Karşı taraf aramayı reddetti.");
            void resetCall();
          } else {
            setIncomingCall((current) => current?.call_id === row.call_id ? null : current);
            setStatus((current) => current === "ringing" ? "idle" : current);
          }
          void supabase().from("call_signals").delete().eq("call_id", row.call_id).eq("signal_type", row.signal_type);
          return;
        }
        if (row.signal_type === "offer" && row.sender_id !== userId && !cancelledCallIdsRef.current.has(row.call_id)) {
          setIncomingCall(row as IncomingCall);
          setStatus("ringing");
        }
      })
      .subscribe((state, subscriptionError) => {
        if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          console.error("Incoming call subscription failed:", state, subscriptionError);
          setError("Gelen arama kanalına bağlanılamadı. Sayfayı yenileyip tekrar dene.");
        }
      });
    incomingChannelRef.current = channel;
    return () => {
      if (incomingChannelRef.current) void supabase().removeChannel(incomingChannelRef.current);
      incomingChannelRef.current = null;
    };
  }, [resetCall, supabase, userId]);

  return {
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
  };
}
