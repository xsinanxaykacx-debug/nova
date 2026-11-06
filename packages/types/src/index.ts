export type UUID = string;
export type ISODateString = string;

export interface Profile {
  id: UUID;
  username: string;
  display_name: string;
  avatar_url: string | null;
  public_key: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface Device {
  id: UUID;
  user_id: UUID;
  platform: "web" | "ios" | "android";
  device_name: string | null;
  created_at: ISODateString;
  last_seen_at: ISODateString | null;
  revoked_at: ISODateString | null;
}

export interface Conversation {
  id: UUID;
  type: "direct" | "group";
  name: string | null;
  avatar_url: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface ConversationMember {
  conversation_id: UUID;
  user_id: UUID;
  role: "admin" | "member";
  joined_at: ISODateString;
}

export interface ConversationKey {
  conversation_id: UUID;
  user_id: UUID;
  key_sender_id: UUID;
  encrypted_group_key: string;
  created_at: ISODateString;
}

export interface ConversationParticipant {
  id: UUID;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export interface Message {
  id: UUID;
  conversation_id: UUID;
  sender_id: UUID;
  ciphertext: string;
  sender_device_id: UUID;
  type: "text" | "audio" | "file";
  created_at: ISODateString;
}
