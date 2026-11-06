import { notFound, redirect } from "next/navigation";
import type { Message } from "@nova/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ChatRoom } from "./chat-room";

type ChatPageProps = { params: { conversation_id: string } };

export default async function ChatPage({ params }: ChatPageProps) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conversation } = await supabase.from("conversations")
    .select("id, type, name, avatar_url")
    .eq("id", params.conversation_id).maybeSingle();
  if (!conversation) notFound();

  const { data: members, error: membersError } = await supabase.from("conversation_members")
    .select("user_id, role").eq("conversation_id", conversation.id).is("left_at", null);
  if (membersError || !members?.some((member) => member.user_id === user.id)) notFound();

  const memberIds = (members ?? []).map((member) => member.user_id);
  const peerIds = memberIds.filter((memberId) => memberId !== user.id);
  if (conversation.type === "direct" && peerIds.length !== 1) notFound();
  if (conversation.type === "group" && peerIds.length < 1) notFound();

  const [{ data: profiles }, { data: history, error: historyError }] = await Promise.all([
    supabase.from("profiles").select("id, public_key, username, display_name, avatar_url").in("id", memberIds),
    supabase.from("messages").select("id, conversation_id, sender_id, ciphertext, sender_device_id, type, created_at, deleted_at")
      .eq("conversation_id", params.conversation_id).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(100),
  ]);
  if (historyError) console.error("Unable to load chat history:", historyError.message);

  const participantProfiles = (profiles ?? []).map((profile) => ({
    id: profile.id,
    display_name: profile.display_name || profile.username || "NOVA kullanıcısı",
    username: profile.username || "",
    avatar_url: profile.avatar_url ?? null,
  }));

  if (conversation.type === "group") {
    const { data: keyRow, error: keyError } = await supabase.from("conversation_keys")
      .select("encrypted_group_key, key_sender_id")
      .eq("conversation_id", conversation.id).eq("user_id", user.id).maybeSingle();
    if (keyError) console.error("Unable to load member group-key envelope:", keyError.message);
    const keySender = keyRow
      ? (profiles ?? []).find((profile) => profile.id === keyRow.key_sender_id)
        ?? (await supabase.from("profiles").select("public_key").eq("id", keyRow.key_sender_id).maybeSingle()).data
      : null;

    return <ChatRoom
      conversationId={conversation.id}
      currentUserId={user.id}
      conversationType="group"
      peerPublicKey={null}
      peerName={conversation.name || "Grup sohbeti"}
      peerUsername=""
      peerAvatarUrl={conversation.avatar_url ?? null}
      groupEncryptedKey={keyRow?.encrypted_group_key ?? null}
      groupKeySenderPublicKey={keySender?.public_key ?? null}
      groupMemberCount={memberIds.length}
      groupParticipants={participantProfiles}
      initialMessages={(history ?? []) as Message[]}
    />;
  }

  const peerProfile = (profiles ?? []).find((profile) => profile.id === peerIds[0]);
  return <ChatRoom
    conversationId={conversation.id}
    currentUserId={user.id}
    conversationType="direct"
    peerPublicKey={peerProfile?.public_key ?? null}
    peerName={peerProfile?.display_name || peerProfile?.username || "NOVA kullanıcısı"}
    peerUsername={peerProfile?.username ?? ""}
    peerAvatarUrl={peerProfile?.avatar_url ?? null}
    initialMessages={(history ?? []) as Message[]}
  />;
}
