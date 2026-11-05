import { notFound, redirect } from "next/navigation";
import type { Message } from "@nova/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ChatRoom } from "./chat-room";

type ChatPageProps = { params: { conversation_id: string } };

export default async function ChatPage({ params }: ChatPageProps) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS limits this lookup and history to members of this conversation.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", params.conversation_id)
    .maybeSingle();
  if (!conversation) notFound();

  const { data: history, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, ciphertext, sender_device_id, created_at")
    .eq("conversation_id", params.conversation_id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(100);
  if (error) console.error("Unable to load chat history:", error.message);

  return (
    <ChatRoom
      conversationId={conversation.id}
      currentUserId={user.id}
      initialMessages={(history ?? []) as Message[]}
    />
  );
}
