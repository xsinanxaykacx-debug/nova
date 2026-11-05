import { notFound, redirect } from "next/navigation";
import type { Message } from "@nova/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ChatRoom } from "./chat-room";

type ChatPageProps = { params: { conversation_id: string } };

export default async function ChatPage({ params }: ChatPageProps) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conversation } = await supabase.from("conversations").select("id")
    .eq("id", params.conversation_id).maybeSingle();
  if (!conversation) notFound();

  const { data: members, error: membersError } = await supabase.from("conversation_members")
    .select("user_id").eq("conversation_id", conversation.id);
  if (membersError) {
    console.error("Unable to load conversation members:", membersError.message);
    notFound();
  }
  const peerIds = (members ?? []).map((member) => member.user_id).filter((memberId) => memberId !== user.id);
  if (peerIds.length !== 1) notFound();

  const [{ data: peerProfile, error: peerError }, { data: history, error }] = await Promise.all([
    supabase.from("profiles").select("public_key, username, display_name, avatar_url").eq("id", peerIds[0]).maybeSingle(),
    supabase.from("messages").select("id, conversation_id, sender_id, ciphertext, sender_device_id, created_at")
      .eq("conversation_id", params.conversation_id).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(100),
  ]);
  if (peerError) console.error("Unable to load peer profile:", peerError.message);
  if (error) console.error("Unable to load chat history:", error.message);

  return <ChatRoom conversationId={conversation.id} currentUserId={user.id}
    peerPublicKey={peerProfile?.public_key ?? null}
    peerName={peerProfile?.display_name || peerProfile?.username || "NOVA kullanıcısı"}
    peerUsername={peerProfile?.username ?? ""}
    peerAvatarUrl={peerProfile?.avatar_url ?? null}
    initialMessages={(history ?? []) as Message[]} />;
}
