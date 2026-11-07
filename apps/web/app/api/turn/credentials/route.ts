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

    const hfToken = process.env.HF_TOKEN;
    if (!hfToken) {
      return NextResponse.json({ error: "Hugging Face TURN token is not configured on the server." }, { status: 503, headers: NO_STORE_HEADERS });
    }

    // Hugging Face's FastRTC partnership endpoint issues Cloudflare TURN credentials.
    // The HF token stays server-side; only the short-lived ICE credentials reach the browser.
    const cloudflareResponse = await fetch(
      "https://fastrtc-turn-service.hf.space/credentials?ttl=600",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${hfToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!cloudflareResponse.ok) {
      console.error("[NABER TURN] Hugging Face TURN credential generation failed:", cloudflareResponse.status);
      return NextResponse.json({ error: "TURN credentials could not be generated." }, { status: 502, headers: NO_STORE_HEADERS });
    }

    const payload = await cloudflareResponse.json() as { iceServers?: RTCIceServer[] };
    if (!Array.isArray(payload.iceServers) || payload.iceServers.length === 0) {
      console.error("[NABER TURN] Hugging Face TURN response did not contain ICE servers.");
      return NextResponse.json({ error: "Hugging Face returned an invalid TURN configuration." }, { status: 502, headers: NO_STORE_HEADERS });
    }

    const iceServers = payload.iceServers
      .filter((server) => server && server.urls)
      .map((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return {
          ...server,
          urls: urls.filter((url) => typeof url === "string" && !url.includes(":53?") && !url.endsWith(":53")),
        };
      })
      .filter((server) => Array.isArray(server.urls) && server.urls.length > 0);

    return NextResponse.json({ iceServers }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (cause) {
    console.error("[NABER TURN] Credential endpoint error:", cause instanceof Error ? cause.message : "Unknown error");
    return NextResponse.json({ error: "TURN credential service is temporarily unavailable." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
