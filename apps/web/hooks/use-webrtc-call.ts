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

type CallSignal = {
  call_id: string;
  sender_id: string;
  receiver_id: string;
  signal_type: "offer" | "answer" | "ice" | "hangup";
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

type CallStatus = "idle" | "calling" | "ringing" | "connecting" | "connected";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export function useWebRTCCall(userId: string) {
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
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingBroadcastRef = useRef<Array<{ event: string; payload: unknown }>>([]);\n  const skipNextNegotiationRef = useRef(false);
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

  const sendBroadcast = useCallback(async (event: string, payload: unknown) => {
    const channel = channelRef.current;
    if (!channel) {
      pendingBroadcastRef.current.push({ event, payload });
      return;
    }
    const result = await channel.send({ type: "broadcast", event, payload });
    if (result !== "ok") throw new Error("Arama sinyali gönderilemedi.");
  }, []);

  const flushPendingBroadcasts = useCallback(async () => {
    const queued = pendingBroadcastRef.current.splice(0);
    for (const item of queued) await sendBroadcast(item.event, item.payload);
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
    pendingIceRef.current = [];
    pendingBroadcastRef.current = [];
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

  const createPeer = useCallback((remoteUserId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });
    peerRef.current = pc;
    peerIdRef.current = remoteUserId;
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendBroadcast("signal", { call_id: callIdRef.current, sender_id: userId, receiver_id: peerIdRef.current, signal_type: "ice", payload: event.candidate.toJSON() } satisfies CallSignal).catch((cause) => {
        setError(cause instanceof Error ? cause.message : "ICE sinyali gönderilemedi.");
      });
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? remoteStreamRef.current ?? new MediaStream();
      if (!event.streams[0]) stream.addTrack(event.track);
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("connected");
      if (pc.connectionState === "failed") {
        setError("Bağlantı kurulamadı. Ağın STUN bağlantısını engelliyor olabilir; TURN desteği gerekiyor.");
        setStatus("connecting");
      }
      if (pc.connectionState === "disconnected") setStatus("connecting");
    };
    return pc;
  }, [sendBroadcast, userId]);

  const attachCallChannel = useCallback(async (callId: string, remoteUserId: string, polite: boolean) => {
    const channel = supabase().channel(`call:${callId}`, {
      config: { private: true, broadcast: { ack: true, self: false } },
    });
    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      const signal = payload as CallSignal;
      if (signal.sender_id === userId || signal.call_id !== callId) return;
      if (signal.signal_type === "hangup") {
        void resetCall();
        return;
      }\n      if (signal.signal_type === "ice") {
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
          await sendBroadcast("signal", {
            call_id: callId,
            sender_id: userId,
            receiver_id: remoteUserId,
            signal_type: "answer",
            payload: pc.localDescription,
          } satisfies CallSignal);
        }
      })().catch((cause) => setError(cause instanceof Error ? cause.message : "Arama sinyali işlenemedi."));
    });
    const result = await new Promise<string>((resolve, reject) => {
      channel.subscribe((state) => {
        if (state === "SUBSCRIBED") resolve(state);
        if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") reject(new Error("Arama sinyal kanalına bağlanılamadı."));
      });
    });
    void result;
    channelRef.current = channel;
    await flushPendingBroadcasts();
    return channel;
  }, [attachRemoteCandidate, flushRemoteCandidates, sendBroadcast, supabase, userId, resetCall]);

  const startCall = useCallback(async (receiverId: string, kind: CallKind) => {
    setError("");
    if (receiverId === userId) throw new Error("Kendini arayamazsın.");
    const stream = await ensureMedia(kind);
    const callId = crypto.randomUUID();
    const pc = createPeer(receiverId);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    callIdRef.current = callId;
    setActiveCallId(callId);
    setStatus("calling");

    makingOfferRef.current = true;
    try {
      await pc.setLocalDescription(await pc.createOffer());
    } finally {
      makingOfferRef.current = false;
    }

    const seed: CallSignal = {
      call_id: callId,
      sender_id: userId,
      receiver_id: receiverId,
      signal_type: "offer",
      payload: pc.localDescription as RTCSessionDescriptionInit,
    };
    const { error: insertError } = await supabase().from("call_signals").insert(seed);
    if (insertError) throw new Error(`Arama başlatılamadı: ${insertError.message}`);

    await attachCallChannel(callId, receiverId, userId.localeCompare(receiverId) > 0);
    await sendBroadcast("signal", seed);
    skipNextNegotiationRef.current = true;
    pc.onnegotiationneeded = async () => {
      if (skipNextNegotiationRef.current) { skipNextNegotiationRef.current = false; return; }
      if (pc.signalingState !== "stable") return;
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        await sendBroadcast("signal", { call_id: callId, sender_id: userId, receiver_id: receiverId, signal_type: "offer", payload: pc.localDescription } satisfies CallSignal);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Bağlantı yeniden müzakere edilemedi.");
      } finally { makingOfferRef.current = false; }
    };
    return callId;
  }, [attachCallChannel, createPeer, ensureMedia, sendBroadcast, supabase, userId]);

  const acceptCall = useCallback(async (call: IncomingCall, kind: CallKind) => {
    setError("");
    const stream = await ensureMedia(kind);
    const pc = createPeer(call.sender_id);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    callIdRef.current = call.call_id;
    setActiveCallId(call.call_id);
    setStatus("connecting");
    await attachCallChannel(call.call_id, call.sender_id, userId.localeCompare(call.sender_id) > 0);
    await pc.setRemoteDescription(new RTCSessionDescription(call.payload));
    await flushRemoteCandidates();
    await pc.setLocalDescription(await pc.createAnswer());
    await sendBroadcast("signal", {
      call_id: call.call_id,
      sender_id: userId,
      receiver_id: call.sender_id,
      signal_type: "answer",
      payload: pc.localDescription,
    } satisfies CallSignal);
    setIncomingCall(null);
    skipNextNegotiationRef.current = true;
    pc.onnegotiationneeded = async () => {
      if (skipNextNegotiationRef.current) { skipNextNegotiationRef.current = false; return; }
      if (pc.signalingState !== "stable") return;
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        await sendBroadcast("signal", { call_id: call.call_id, sender_id: userId, receiver_id: call.sender_id, signal_type: "offer", payload: pc.localDescription } satisfies CallSignal);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Bağlantı yeniden müzakere edilemedi.");
      } finally { makingOfferRef.current = false; }
    };
  }, [attachCallChannel, createPeer, ensureMedia, flushRemoteCandidates, sendBroadcast, userId]);

  const rejectCall = useCallback(async (call: IncomingCall) => {
    await supabase().from("call_signals").delete().eq("id", call.id);
    setIncomingCall(null);
  }, [supabase]);

  const hangUp = useCallback(async () => {
    const callId = callIdRef.current;
    if (callId) {
      await sendBroadcast("signal", {
        call_id: callId,
        sender_id: userId,
        receiver_id: peerIdRef.current,
        signal_type: "hangup",
        payload: {},
      });
      await supabase().from("call_signals").delete().eq("call_id", callId);
    }
    await resetCall();
  }, [resetCall, sendBroadcast, supabase, userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase().channel(`incoming-calls:${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "call_signals",
        filter: `receiver_id=eq.${userId}`,
      }, (event) => {
        const row = event.new as IncomingCall;
        if (row.signal_type === "offer" && row.sender_id !== userId) {
          setIncomingCall(row);
          setStatus("ringing");
        }
      })
      .subscribe();
    incomingChannelRef.current = channel;
    return () => {
      if (incomingChannelRef.current) void supabase().removeChannel(incomingChannelRef.current);
      incomingChannelRef.current = null;
    };
  }, [supabase, userId]);

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
