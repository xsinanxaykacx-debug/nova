export type UUID=string;
export type ISODateString=string;
export interface Profile{id:UUID;username:string;display_name:string;avatar_url:string|null;created_at:ISODateString;updated_at:ISODateString;}
export interface Device{id:UUID;user_id:UUID;platform:"web"|"ios"|"android";device_name:string|null;created_at:ISODateString;last_seen_at:ISODateString|null;revoked_at:ISODateString|null;}
export interface Conversation{id:UUID;kind:"direct"|"group";created_at:ISODateString;updated_at:ISODateString;}
export interface Message{id:UUID;conversation_id:UUID;sender_id:UUID;sender_device_id:UUID;ciphertext:string;created_at:ISODateString;edited_at:ISODateString|null;deleted_at:ISODateString|null;}
