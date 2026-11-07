import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const turnKeyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const turnApiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
    if (!turnKeyId || !turnApiToken) {
      return NextResponse.json({ error: "Cloudflare TURN is not configured on the server." }, { status: 503, headers: NO_STORE_HEADERS });
    }

    const cloudflareResponse = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnKeyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${turnApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!cloudflareResponse.ok) {
      console.error("[NOVA TURN] Cloudflare credential generation failed:", cloudflareResponse.status);
      return NextResponse.json({ error: "TURN credentials could not be generated." }, { status: 502, headers: NO_STORE_HEADERS });
    }

    const payload = await cloudflareResponse.json() as { iceServers?: RTCIceServer[] };
    if (!Array.isArray(payload.iceServers) || payload.iceServers.length === 0) {
      console.error("[NOVA TURN] Cloudflare response did not contain ICE servers.");
      return NextResponse.json({ error: "Cloudflare returned an invalid TURN configuration." }, { status: 502, headers: NO_STORE_HEADERS });
    }

    const iceServers = payload.iceServers
      .filter((server) => server && server.urls)
      .map((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return {
          ...server,
          urls: urls.filter((url) => typeof url === "string" && !/:53(?:\\?|$)/.test(url)),
        };
      })
      .filter((server) => Array.isArray(server.urls) && server.urls.length > 0);

    return NextResponse.json({ iceServers }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (cause) {
    console.error("[NOVA TURN] Credential endpoint error:", cause instanceof Error ? cause.message : "Unknown error");
    return NextResponse.json({ error: "TURN credential service is temporarily unavailable." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
