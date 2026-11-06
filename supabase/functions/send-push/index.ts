const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  ));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(`Google OAuth failed: ${JSON.stringify(result)}`);
  }
  return result.access_token as string;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expectedSecret || request.headers.get("x-push-secret") !== expectedSecret) {
    return json({ error: "Unauthorized webhook" }, 401);
  }

  try {
    const payload = await request.json();
    if (payload?.type !== "INSERT" || payload?.table !== "messages" || !payload?.record) {
      return json({ skipped: true, reason: "Not a message insert" });
    }

    const record = payload.record;
    const conversationId = record.conversation_id;
    const senderId = record.sender_id;
    if (!conversationId || !senderId) return json({ skipped: true, reason: "Missing message fields" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!supabaseUrl || !serviceRoleKey || !serviceAccountRaw) {
      throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or FIREBASE_SERVICE_ACCOUNT secret");
    }

    const serviceHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    };
    const membersUrl = new URL(`${supabaseUrl}/rest/v1/conversation_members`);
    membersUrl.searchParams.set("conversation_id", `eq.${conversationId}`);
    membersUrl.searchParams.set("user_id", `neq.${senderId}`);
    membersUrl.searchParams.set("left_at", "is.null");
    membersUrl.searchParams.set("select", "user_id");
    const membersResponse = await fetch(membersUrl, { headers: serviceHeaders });
    if (!membersResponse.ok) throw new Error(`Could not load conversation members: ${await membersResponse.text()}`);
    const members = await membersResponse.json();
    const recipientIds = [...new Set((members as Array<{ user_id: string }>).map((member) => member.user_id))];
    if (!recipientIds.length) return json({ sent: 0, reason: "No recipients" });

    const tokensUrl = new URL(`${supabaseUrl}/rest/v1/fcm_tokens`);
    tokensUrl.searchParams.set("user_id", `in.(${recipientIds.join(",")})`);
    tokensUrl.searchParams.set("select", "token");
    const tokensResponse = await fetch(tokensUrl, { headers: serviceHeaders });
    if (!tokensResponse.ok) throw new Error(`Could not load FCM tokens: ${await tokensResponse.text()}`);
    const tokens = await tokensResponse.json() as Array<{ token: string }>;
    if (!tokens.length) return json({ sent: 0, reason: "No registered devices" });

    const serviceAccount = JSON.parse(serviceAccountRaw);
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;
    const results = await Promise.allSettled(tokens.map(async ({ token }) => {
      const response = await fetch(fcmUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            data: { title: "NOVA", body: "Yeni mesaj var", conversation_id: String(conversationId) },
          },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return await response.json();
    }));

    const sent = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - sent;
    return json({ sent, failed, recipients: recipientIds.length, devices: tokens.length });
  } catch (error) {
    console.error("send-push failed:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
