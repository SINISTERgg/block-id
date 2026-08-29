import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  DEFAULT_IPFS_GATEWAY,
  extractCid,
  isValidCid,
  toGatewayUrl,
} from "../_shared/ipfs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_BYTES = 512 * 1024; // 512 KB guard rail

/**
 * Resolves a CID or ipfs:// URI from an IPFS gateway.
 * Accepts: { cid } | { uri } | ?cid= / ?uri= query params.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let input: string | null = null;
    if (req.method === "GET") {
      const url = new URL(req.url);
      input = url.searchParams.get("cid") ?? url.searchParams.get("uri");
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      input = body?.cid ?? body?.uri ?? null;
    } else {
      throw new Error(`Method ${req.method} not allowed`);
    }

    if (!input || typeof input !== "string") throw new Error("Provide a `cid` or `uri` parameter");

    const cid = extractCid(input);
    if (!cid || !isValidCid(cid)) throw new Error("Invalid CID or IPFS URI");

    const gateway = Deno.env.get("IPFS_GATEWAY_URL") || DEFAULT_IPFS_GATEWAY;
    const gatewayUrl = toGatewayUrl(cid, gateway);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(gatewayUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Gateway returned HTTP ${res.status} for ${cid}`);
    }

    const raw = await res.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_CONTENT_BYTES) {
      throw new Error("Content exceeds maximum allowed size");
    }

    // Return parsed JSON when possible, otherwise pass text through
    let content: unknown;
    try {
      content = JSON.parse(raw);
    } catch {
      content = raw;
    }

    return new Response(
      JSON.stringify({
        cid,
        ipfsUri: `ipfs://${cid}`,
        gatewayUrl,
        contentType: res.headers.get("content-type"),
        sizeBytes: new TextEncoder().encode(raw).byteLength,
        content,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-from-ipfs error:", e);
    const status = e instanceof Error && e.message.includes("not allowed") ? 405 : 400;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
